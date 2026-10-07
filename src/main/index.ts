import { app, BrowserWindow, ipcMain, Notification, Tray, nativeImage, shell, dialog } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { xdgDir } from './paths.js';
import { openDb } from './db.js';
import { MpvPlayer } from './mpv.js';
import { resolveStreamUrl, searchFlat, ytdlp, ytdlpVersion, updateYtdlp, httpHeaders, setCookiesFile, hasCookiesFile } from './ytdlp.js';
import { userAgent, appVersion } from '../../common/userAgent.js';
import { scoreMatch, MATCH_THRESHOLD } from '../../common/matcher.js';
import type { SourceId, Track } from '../../common/types.js';
import { Mpris } from './mpris.js';
import { openLoginWindow, spotifyAuthUrl, sessionFor } from './login.js';
import { saveSecret, loadSecret, clearSecrets, exportCookiesFile, usingFallback } from './authStore.js';

const mpv = new MpvPlayer();
const mpris = new Mpris();
let lastTimePos = 0;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function resourcePath(...parts: string[]): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'resources', ...parts);
  return path.join(__dirname, '../../../resources', ...parts);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 800, title: 'Lyra',
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    backgroundColor: '#131318',
    icon: resourcePath('icons', '256x256.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(__dirname, '../../../dist/index.html'));
  mpv.onEvent = (name, value) => {
    if (name === 'eof-reached' && value) win?.webContents.send('lyra:ended');
    if (name === 'time-pos' && typeof value === 'number') { lastTimePos = value; mpris.updatePosition(value); }
    if (name === 'pause') mpris.updateState(value === false ? 'Playing' : 'Paused');
    win?.webContents.send('lyra:mpv', { name, value });
  };
  mpris.getPosition = () => lastTimePos;
  mpris.onAction = (action, arg) => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('lyra:mpris-cmd', { action, arg });
  };
  mpris.onQuit = () => app.quit();
  mpris.onRaise = () => { win?.show(); win?.focus(); };
}

function notify(title: string, body: string): void {
  new Notification({ title, body }).show();
}

app.whenReady().then(() => {
  for (const k of ['config', 'cache', 'data'] as const) fs.mkdirSync(xdgDir(k), { recursive: true });
  openDb();
  createWindow();
  dlog(`boot Lyra build ${BOOT_ID}`);
  void mpris.init('Lyra', (m) => {
    try {
      fs.appendFileSync(path.join(xdgDir('cache'), 'lyra.log'), `${new Date().toISOString()} ${m}\n`);
    } catch { /* noop */ }
  });
  try {
    const img = nativeImage.createFromPath(resourcePath('icons', '32x32.png'));
    if (!img.isEmpty()) { tray = new Tray(img); tray.setToolTip('Lyra'); }
  } catch { /* noop */ }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('quit', () => mpv.stop());

// single instance: a second launch focuses the running window instead of
// starting another mpv (two players = mixed-up "random" audio)
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

// ---- playback ----
ipcMain.handle('lyra:control', async (_e, cmd: string, arg?: number) => {
  if (cmd === 'toggle') await mpv.toggle();
  else if (cmd === 'play') await mpv.play();
  else if (cmd === 'pause') await mpv.pause();
  else if (cmd === 'next') await mpv.next();
  else if (cmd === 'prev') await mpv.prev();
  else if (cmd === 'seek') await mpv.seek(arg ?? 0);
  else if (cmd === 'seek-rel') await mpv.seekRel(arg ?? 0);
  else if (cmd === 'volume') await mpv.setVolume(arg ?? 80);
  else if (cmd === 'replaygain') await mpv.setReplayGain((arg ?? 1) === 1);
  return true;
});

/** Central play entry: resolves any track to audio and loads it into mpv. */
let playSeq = 0;
ipcMain.handle('lyra:play-track', async (_e, t: Track, audioOrder: SourceId[]) => {
  const my = ++playSeq;
  const alive = (): boolean => my === playSeq;
  dlog(`[play#${my}] want ${t.source} "${t.artist} — ${t.title}" url=${t.url ?? '(none)'} local=${t.localPath ?? '(none)'}`);
  // previous track must stop NOW, even while the next one is still resolving
  try { await mpv.halt(); } catch { /* noop */ }
  const playOne = async (stream: string): Promise<{ ok: true; streamUrl: string }> => {
    if (!alive()) throw new Error('superseded');
    await mpv.load(stream); // a player error here must NEVER trigger another song
    if (!alive()) throw new Error('superseded');
    return { ok: true, streamUrl: stream };
  };
  try {
    if (t.localPath) {
      // verify the file is actually there and really THIS track (not a stale/false mapping)
      try {
        if (!fs.existsSync(t.localPath)) throw new Error('local-gone');
        if (t.duration > 30) {
          const mm = await import('music-metadata') as unknown as {
            parseFile: (f: string) => Promise<{ format: { duration?: number } }>;
          };
          const meta = await mm.parseFile(t.localPath).catch(() => null);
          const d = Math.round(meta?.format.duration ?? 0);
          if (d > 30 && Math.abs(d - t.duration) > 8) throw new Error('local-mismatch');
        }
      } catch (e) {
        if (String(e).includes('local-')) throw e;
        // metadata unreadable: play anyway (better than silence)
      }
      dlog(`[play#${my}] local file ok: ${t.localPath}`);
      return playOne(t.localPath);
    }
    if (t.source === 'spotify') {
      const m = await matchAudio(t, audioOrder, ['spotify'], `[play#${my}]`);
      if (!m) return { ok: false, reason: 'no-match' };
      const stream = await resolveStreamUrl(m.url, false);
      dlog(`[play#${my}] spotify -> ${m.source} [${streamHost(stream)}]`);
      return { ...(await playOne(stream)), audioSource: m.source };
    }
    if (!t.url) return { ok: false, reason: 'no-url' };
    let stream: string;
    let audioSource: SourceId | undefined;
    try {
      stream = await resolveStreamUrl(t.url, false);
      dlog(`[play#${my}] direct resolve ok [${streamHost(stream)}]`);
    } catch (e) {
      dlog(`[play#${my}] direct resolve FAILED: ${String(e).split('\n').pop()?.slice(0, 160)}`);
      // logged-in users get one retry WITH cookies (private/403/login-gated tracks)
      if (/403|private|login|sign in/i.test(String(e)) && hasCookiesFile() && (t.source === 'soundcloud' || t.source === 'youtubemusic')) {
        try { stream = await resolveStreamUrl(t.url, true); dlog(`[play#${my}] cookies retry ok`); }
        catch { ({ stream, audioSource } = await fallbackStream(t, audioOrder, e, `[play#${my}]`)); }
      } else if (isPlayableError(e)) {
        ({ stream, audioSource } = await fallbackStream(t, audioOrder, e, `[play#${my}]`));
      } else throw e;
    }
    const r = await playOne(stream!);
    dlog(`[play#${my}] LOADED${audioSource ? ` via fallback ${audioSource}` : ''} [${streamHost(stream!)}]`);
    return audioSource ? { ...r, audioSource } : r;
  } catch (err) {
    if (String(err).includes('superseded')) { dlog(`[play#${my}] superseded by newer request`); return { ok: false, reason: 'superseded' }; }
    dlog(`[play#${my}] FAILED: ${String(err).slice(0, 160)}`);
    return { ok: false, reason: String(err).slice(0, 200) };
  }
});

async function fallbackStream(t: Track, audioOrder: SourceId[], e: unknown, tag: string): Promise<{ stream: string; audioSource: SourceId }> {
  // DRM / preview / geo / deleted: find the SAME track on another platform
  const m = await matchAudio(t, audioOrder, [t.source], tag);
  if (!m) throw new Error(`no-match:${audioReason(e)}`);
  dlog(`${tag} fallback -> ${m.source} ${m.url}`);
  const stream = await resolveStreamUrl(m.url, false);
  return { stream, audioSource: m.source };
}
/** Short stream origin for the journal (host, or 'local file'). */
function streamHost(stream: string): string {
  try { return new URL(stream).hostname; }
  catch { return 'local file'; }
}
const BOOT_ID = `${mainVersion()}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
function mainVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? appVersion();
  } catch { return appVersion(); }
}
export function dlog(msg: string): void {
  try {
    fs.appendFileSync(path.join(xdgDir('cache'), 'lyra.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch { /* noop */ }
}

/** Errors worth a cross-platform fallback (vs. fatal ones like no network). */
function isPlayableError(e: unknown): boolean {
  const s = String(e);
  return /DRM|premiere|preview|geo|unavailable|private|deleted|removed|403|404|410|age|login|sign in/i.test(s);
}
function audioReason(e: unknown): string {
  const s = String(e);
  if (/DRM|premiere/i.test(s)) return 'drm';
  if (/preview/i.test(s)) return 'preview';
  if (/geo/i.test(s)) return 'geo';
  return 'unavailable';
}

async function matchAudio(t: Track, order: SourceId[], exclude: SourceId[], tag = '[match]'): Promise<{ source: SourceId; url: string } | null> {
  for (const src of order) {
    if (src !== 'soundcloud' && src !== 'youtubemusic') continue;
    if (exclude.includes(src)) continue;
    const prefix = src === 'soundcloud' ? 'scsearch8:' : 'ytsearch8:';
    let entries;
    try { entries = await searchFlat(`${prefix}${t.title} ${t.artist}`, 8, false); }
    catch (e) { dlog(`${tag} ${src} search failed: ${String(e).slice(0, 120)}`); continue; }
    let best: { score: number; url: string; title: string } | null = null;
    const scored: string[] = [];
    for (const c of entries) {
      if (!c.url) continue;
      const s = scoreMatch(
        { title: t.title, artist: t.artist, duration: t.duration },
        { title: c.title, artist: c.artist ?? '', duration: c.duration ?? 0 },
      );
      scored.push(`${s < 0 ? 'REJ' : s.toFixed(2)} "${(c.title ?? '').slice(0, 40)}"`);
      if (s >= MATCH_THRESHOLD && (!best || s > best.score)) best = { score: s, url: c.url, title: c.title };
    }
    dlog(`${tag} ${src} candidates: ${scored.slice(0, 5).join(' | ') || '(none)'}`);
    if (best) { dlog(`${tag} ${src} BEST ${best.score.toFixed(2)} "${best.title.slice(0, 50)}"`); return { source: src, url: best.url }; }
  }
  dlog(`${tag} no match above threshold`);
  return null;
}

// ---- search (real backends) ----
ipcMain.handle('lyra:search', async (_e, q: string, source: string) => {
  const prefix = source === 'soundcloud' ? 'scsearch10:' : source === 'youtubemusic' ? 'ytsearch10:' : '';
  const entries = await searchFlat(prefix ? `${prefix}${q}` : q, 10, false);
  return entries
    .filter((e) => e.title?.trim())
    .map((e, i) => ({
      id: `${source}:${e.id || i}`, source, title: e.title.trim(), artist: e.artist?.trim() || 'Unknown',
      duration: e.duration ?? 0, coverUrl: e.thumbnail, url: e.url || undefined,
    }));
});

// ---- Spotify Web API (client credentials = search/catalog; needs id+secret in env) ----
let spToken: { v: string; exp: number } | null = null;
async function spotifyToken(): Promise<string> {
  const id = process.env.LYRA_SPOTIFY_CLIENT_ID ?? '';
  const secret = process.env.LYRA_SPOTIFY_CLIENT_SECRET ?? '';
  if (!id || !secret) throw new Error('need-setup');
  if (spToken && Date.now() < spToken.exp) return spToken.v;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`spotify-auth ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  spToken = { v: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return spToken.v;
}

ipcMain.handle('lyra:spotify-search', async (_e, q: string) => {
  const tok = await spotifyToken();
  const r = await fetch(`https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: 'track', limit: '10' })}`, {
    headers: { Authorization: `Bearer ${tok}`, ...httpHeaders() },
  });
  if (!r.ok) throw new Error(`spotify ${r.status}`);
  const j = (await r.json()) as { tracks?: { items?: { id: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; duration_ms: number }[] } };
  return (j.tracks?.items ?? []).map((t) => ({
    id: `spotify:${t.id}`, source: 'spotify', title: t.name,
    artist: t.artists.map((a) => a.name).join(', '), album: t.album.name,
    duration: Math.round(t.duration_ms / 1000), coverUrl: t.album.images[0]?.url,
  }));
});

// ---- local library: pick folders + recursive scan with tags ----
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.ogg', '.opus', '.m4a', '.wav']);
ipcMain.handle('lyra:local-pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] });
  if (r.canceled) return null;
  return { folders: r.filePaths, tracks: await scanFolders(r.filePaths) };
});
ipcMain.handle('lyra:local-scan', async (_e, folders: string[]) => scanFolders(folders));

async function scanFolders(folders: string[]): Promise<Track[]> {
  const mm = await import('music-metadata') as unknown as {
    parseFile: (f: string, o?: unknown) => Promise<{
      common: { title?: string; artist?: string; album?: string };
      format: { duration?: number };
    }>;
  };
  const parseFile = mm.parseFile;
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('.')) walk(p); }
      else if (e.isFile() && AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) files.push(p);
      if (files.length >= 3000) return;
    }
  };
  for (const f of folders) walk(f);
  const out: Track[] = [];
  for (const f of files.slice(0, 3000)) {
    try {
      const m = await parseFile(f, { duration: true });
      out.push({
        id: `local:${f}`, source: 'local',
        title: m.common.title ?? path.basename(f, path.extname(f)),
        artist: m.common.artist ?? 'Unknown', album: m.common.album,
        duration: Math.round(m.format.duration ?? 0), localPath: f,
      });
    } catch {
      // unreadable/broken tags: still list the file by name instead of hiding it
      out.push({
        id: `local:${f}`, source: 'local',
        title: path.basename(f, path.extname(f)), artist: 'Unknown',
        duration: 0, localPath: f,
      });
    }
  }
  return out;
}
ipcMain.handle('lyra:default-music-dir', () => app.getPath('music'));
ipcMain.handle('lyra:cache-dir', () => {
  const d = path.join(xdgDir('data'), 'downloads');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* noop */ }
  return d;
});
/** Read sidecar .lrc next to an audio file (same basename). */
ipcMain.handle('lyra:sidecar-lyrics', async (_e, audioPath: string) => {
  try {
    const lrc = audioPath.replace(/\.[^.]+$/, '.lrc');
    if (fs.existsSync(lrc)) return fs.readFileSync(lrc, 'utf8');
    return null;
  } catch { return null; }
});

// ---- downloads: real yt-dlp with progress events ----
const dlJobs = new Map<string, ChildProcess>();
function dlDir(): string {
  const d = path.join(app.getPath('music'), 'Lyra');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
ipcMain.handle('lyra:pick-folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0] ?? null;
});

function normName(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9а-яё]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Batch-match tracks against audio files already present in a folder (no re-download). */
ipcMain.handle('lyra:find-local', async (_e, folder: string, queries: { title: string; artist: string; duration?: number }[]) => {
  let files: string[] = [];
  try {
    files = fs.readdirSync(folder).filter((f) => ['.mp3', '.flac', '.ogg', '.opus', '.m4a', '.wav'].includes(path.extname(f).toLowerCase()));
  } catch { return queries.map(() => null); }
  let parseFile: ((f: string) => Promise<{ format: { duration?: number } }>) | null = null;
  try {
    const mm = await import('music-metadata') as unknown as {
      parseFile: (f: string, o?: unknown) => Promise<{ format: { duration?: number } }>;
    };
    parseFile = mm.parseFile;
  } catch { /* name-only matching */ }
  const out: (string | null)[] = [];
  for (const q of queries) {
    const nt = normName(q.title);
    const na = normName(q.artist);
    const words = `${na} ${nt}`.split(' ').filter((w) => w.length > 1);
    const longKey = nt.replace(/ /g, '').length >= 10 ? nt.replace(/ /g, '') : '';
    const hit = files.find((f) => {
      const nf = normName(path.basename(f, path.extname(f)));
      const flat = nf.replace(/ /g, '');
      if (longKey && flat.includes(longKey)) return true;
      if (words.length && words.every((w) => nf.includes(w))) return true;
      return false;
    });
    if (!hit) { out.push(null); continue; }
    // duration cross-check kills false positives (remixes/covers with similar names)
    if (hit && parseFile && (q.duration ?? 0) > 30) {
      try {
        const meta = await parseFile(path.join(folder, hit)).catch(() => null);
        const d = Math.round(meta?.format.duration ?? 0);
        if (d > 30 && Math.abs(d - (q.duration ?? 0)) > 8) { out.push(null); continue; }
      } catch { /* keep name match */ }
    }
    out.push(path.join(folder, hit));
  }
  return out;
});

ipcMain.handle('lyra:download-start', async (e, url: string, format: string, dest?: string, outName?: string) => {
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const outDir = dest ?? dlDir();
  try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* noop */ }
  const template = outName ? `${outName}.%(ext)s` : '%(title)s.%(ext)s';
  const child = spawn('yt-dlp', [
    '-x', '--audio-format', format, '--embed-metadata', '--embed-thumbnail',
    '--newline', '--progress', '--no-playlist', '--print', 'after_move:filepath',
    '-o', path.join(outDir, template), url,
  ]);
  dlJobs.set(id, child);
  let stdout = '';
  child.stdout?.on('data', (d: Buffer) => { stdout += d.toString().slice(-2000); });
  const send = (msg: unknown): void => {
    if (win && !win.isDestroyed()) win.webContents.send('lyra:download-progress', msg);
    void e;
  };
  child.stderr?.on('data', (d: Buffer) => {
    const m = d.toString().match(/(\d+(?:\.\d+)?)%/);
    if (m) send({ id, status: 'active', progress: Number(m[1]) });
  });
  child.on('error', () => { send({ id, status: 'error' }); dlJobs.delete(id); });
  child.on('close', (code) => {
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const file = code === 0 ? lines[lines.length - 1] : undefined;
    send({ id, status: code === 0 ? 'done' : 'error', progress: code === 0 ? 100 : undefined, file });
    dlJobs.delete(id);
  });
  send({ id, status: 'active', progress: 0 });
  return id;
});
ipcMain.handle('lyra:download-cancel', async (_e, id: string) => {
  dlJobs.get(id)?.kill('SIGTERM');
  dlJobs.delete(id);
  return true;
});

// ---- downloaded files management (Settings) ----
function managedDirs(): string[] {
  const dirs = [path.join(app.getPath('music'), 'Lyra'), path.join(xdgDir('data'), 'downloads')];
  return dirs.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}
ipcMain.handle('lyra:dl-dir', () => path.join(app.getPath('music'), 'Lyra'));
ipcMain.handle('lyra:dl-list', () => {
  const out: { path: string; size: number }[] = [];
  for (const d of managedDirs()) {
    let files: string[] = [];
    try { files = fs.readdirSync(d); } catch { continue; }
    for (const f of files) {
      if (!['.mp3', '.flac', '.ogg', '.opus', '.m4a', '.wav'].includes(path.extname(f).toLowerCase())) continue;
      const p = path.join(d, f);
      try { out.push({ path: p, size: fs.statSync(p).size }); } catch { /* noop */ }
    }
  }
  return out;
});
ipcMain.handle('lyra:dl-delete', async (_e, paths: string[]) => {
  let n = 0;
  for (const p of paths) {
    try { fs.unlinkSync(p); n++; } catch { /* noop */ }
  }
  return n;
});
ipcMain.handle('lyra:files-exist', (_e, paths: string[]) => {
  return paths.map((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
});
ipcMain.handle('lyra:read-log', () => {
  try {
    const lines = fs.readFileSync(path.join(xdgDir('cache'), 'lyra.log'), 'utf8').split('\n').filter(Boolean);
    return lines.slice(-120);
  } catch { return []; }
});
ipcMain.handle('lyra:ui-log', (_e, msg: string) => {
  dlog(`[ui] ${String(msg).slice(0, 220)}`);
  return true;
});

// ---- window controls (frameless window) ----
ipcMain.handle('lyra:win', (_e, cmd: 'min' | 'max' | 'close' | 'is-max') => {
  if (!win) return false;
  if (cmd === 'min') win.minimize();
  else if (cmd === 'close') win.close();
  else if (cmd === 'max') { win.isMaximized() ? win.unmaximize() : win.maximize(); }
  else if (cmd === 'is-max') return win.isMaximized();
  return true;
});

// ---- SoundCloud api-v2 (public client_id extracted from web client + user oauth_token) ----
let scClientId: string | null = null;
async function soundcloudClientId(): Promise<string> {
  if (scClientId) return scClientId;
  const html = await (await fetch('https://soundcloud.com', { headers: httpHeaders() })).text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).slice(-6);
  for (const s of scripts) {
    try {
      const js = await (await fetch(s.startsWith('http') ? s : `https://soundcloud.com${s}`, { headers: httpHeaders() })).text();
      const m = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
      if (m) { scClientId = m[1]; return m[1]; }
    } catch { /* next */ }
  }
  throw new Error('no client_id');
}

async function scApi(pathname: string, token?: string): Promise<unknown> {
  const cid = await soundcloudClientId();
  const r = await fetch(`https://api-v2.soundcloud.com${pathname}${pathname.includes('?') ? '&' : '?'}client_id=${cid}`, {
    headers: token ? { Authorization: `OAuth ${token}`, ...httpHeaders() } : httpHeaders(),
  });
  if (!r.ok) throw new Error(`sc ${r.status}`);
  return r.json() as Promise<unknown>;
}

async function scToken(): Promise<string | undefined> {
  const cs = await sessionFor('soundcloud').cookies.get({ url: 'https://soundcloud.com' });
  return cs.find((c) => c.name === 'oauth_token')?.value;
}

function scTrack(j: { id: number; title: string; user?: { username?: string }; duration?: number; artwork_url?: string; permalink_url?: string }): Track {
  return {
    id: `soundcloud:${j.id}`, source: 'soundcloud', title: j.title, artist: j.user?.username ?? '',
    duration: Math.round((j.duration ?? 0) / 1000),
    coverUrl: j.artwork_url?.replace('-large.', '-t500x500.'), url: j.permalink_url,
  };
}

ipcMain.handle('lyra:sc-library', async (_e, kind: 'likes' | 'playlists') => {
  const token = await scToken();
  if (!token) throw new Error('not connected');
  const me = (await scApi('/me', token)) as { id: number };
  if (kind === 'likes') {
    const j = (await scApi(`/users/${me.id}/track_likes?limit=50`, token)) as { collection?: unknown[] };
    const arg = (x: unknown): Parameters<typeof scTrack>[0] => (x as { track: Parameters<typeof scTrack>[0] }).track;
    return (j.collection ?? []).map(arg).filter(Boolean).map(scTrack);
  }
  const j = (await scApi(`/users/${me.id}/playlists?limit=50`, token)) as { collection?: { id: number; title: string; track_count?: number; artwork_url?: string }[] };
  return (j.collection ?? []).map((p) => ({ id: `soundcloud:playlist:${p.id}`, source: 'soundcloud', title: p.title, trackCount: p.track_count, coverUrl: p.artwork_url?.replace('-large.', '-t500x500.') }));
});

ipcMain.handle('lyra:sc-charts', async () => {
  const j = (await scApi('/charts?kind=trending&genre=soundcloud%3Agenres%3Aall-music&limit=20')) as { collection?: { track?: Parameters<typeof scTrack>[0] }[] };
  return ((j.collection ?? []).map((c) => c.track).filter(Boolean) as Parameters<typeof scTrack>[0][]).map(scTrack);
});

ipcMain.handle('lyra:search-playlists', async (_e, q: string, source: string) => {
  if (source !== 'soundcloud') throw new Error('playlists search: soundcloud only');
  const j = (await scApi(`/search/playlists?q=${encodeURIComponent(q)}&limit=15`)) as { collection?: { id: number; title: string; track_count?: number; artwork_url?: string; user?: { username?: string } }[] };
  return (j.collection ?? []).map((p) => ({
    id: `soundcloud:playlist:${p.id}`, source: 'soundcloud', title: p.title,
    artist: p.user?.username ?? '', trackCount: p.track_count,
    coverUrl: p.artwork_url?.replace('-large.', '-t500x500.'),
    url: `https://soundcloud.com/discover/sets`, playlistId: p.id,
  }));
});

ipcMain.handle('lyra:playlist-covers', async (_e, source: string, playlistId: number | string) => {
  try {
    if (source === 'soundcloud') {
      const j = (await scApi(`/playlists/${playlistId}`)) as { tracks?: { artwork_url?: string }[] };
      return (j.tracks ?? []).map((x) => x.artwork_url?.replace('-large.', '-t500x500.')).filter(Boolean).slice(0, 4);
    }
    if (source === 'spotify') {
      const id = String(playlistId).split(':').pop();
      const j = (await spotifyFetch(`/playlists/${id}/tracks?limit=20&fields=items(track(album(images))))`)) as { items?: { track: { album: { images: { url: string }[] } } }[] };
      const out: string[] = [];
      for (const x of j.items ?? []) {
        const u = x.track?.album?.images?.[0]?.url;
        if (u && !out.includes(u)) out.push(u);
        if (out.length >= 4) break;
      }
      return out;
    }
    return [];
  } catch { return []; }
});

ipcMain.handle('lyra:playlist-tracks', async (_e, source: string, ref: { id?: string; playlistId?: number; url?: string }) => {
  let url = ref.url;
  if (!url && source === 'soundcloud' && ref.playlistId) {
    // resolve playlist permalink via api, then dump its tracks
    const j = (await scApi(`/playlists/${ref.playlistId}`)) as { permalink_url?: string; tracks?: Parameters<typeof scTrack>[0][] };
    if (j.tracks?.length) return j.tracks.map(scTrack);
    if (j.permalink_url) url = j.permalink_url;
  }
  if (!url) throw new Error('no playlist url');
  const out = await ytdlp(['--flat-playlist', '--dump-json', url], false);
  const tracks: Track[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as { id?: string; title?: string; uploader?: string; duration?: number; thumbnails?: { url?: string }[]; webpage_url?: string; url?: string };
      if (!j.title?.trim()) continue;
      tracks.push({
        id: `${source}:${j.id ?? tracks.length}`, source: source as SourceId,
        title: j.title.trim(), artist: j.uploader?.trim() || 'Unknown', duration: Math.round(j.duration ?? 0),
        coverUrl: j.thumbnails?.slice(-1)[0]?.url, url: j.webpage_url ?? j.url,
      });
    } catch { /* skip */ }
  }
  return tracks;
});

// ---- Spotify OAuth PKCE via SYSTEM browser + loopback (real user tokens) ----
function spotifyClientId(): string {
  const id = process.env.LYRA_SPOTIFY_CLIENT_ID ?? '';
  if (!id) throw new Error('need-setup');
  return id;
}

ipcMain.handle('lyra:spotify-oauth', async () => {
  const clientId = spotifyClientId();
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const code = await new Promise<string>((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = new URL(req.url ?? '', 'http://127.0.0.1:8899');
        const c = u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<body style="background:#131318;color:#e6e0e9;font-family:sans-serif"><h2>Lyra: signed in — return to the app</h2></body>');
        srv.close();
        if (c) resolve(c);
        else reject(new Error('no code'));
      } catch (e) { reject(e as Error); }
    });
    srv.listen(8899, '127.0.0.1');
    const auth = `https://accounts.spotify.com/authorize?${new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: 'http://127.0.0.1:8899/callback',
      code_challenge_method: 'S256', code_challenge: challenge,
      scope: 'user-library-read playlist-read-private playlist-read-collaborative user-follow-read',
    })}`;
    void shell.openExternal(auth);
    setTimeout(() => { srv.close(); reject(new Error('timeout')); }, 180000).unref?.();
  });
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: 'http://127.0.0.1:8899/callback',
      client_id: clientId, code_verifier: verifier,
    }),
  });
  if (!r.ok) throw new Error(`spotify token ${r.status}`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string };
  saveSecret('spotify-token', j.access_token);
  if (j.refresh_token) saveSecret('spotify-refresh', j.refresh_token);
  if (win && !win.isDestroyed()) win.webContents.send('lyra:login-done', 'spotify');
  return true;
});

async function spotifyFetch(pathname: string): Promise<unknown> {
  let tok = loadSecret('spotify-token') ?? '';
  const call = async (): Promise<Response> => fetch(`https://api.spotify.com/v1${pathname}`, {
    headers: { Authorization: `Bearer ${tok}`, ...httpHeaders() },
  });
  let r = await call();
  if (r.status === 401) {
    const refresh = loadSecret('spotify-refresh');
    if (!refresh) throw new Error('not connected');
    const t = await (await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: spotifyClientId() }),
    })).json() as { access_token?: string };
    if (!t.access_token) throw new Error('not connected');
    tok = t.access_token;
    saveSecret('spotify-token', tok);
    r = await call();
  }
  if (!r.ok) throw new Error(`spotify ${r.status}`);
  return r.json() as Promise<unknown>;
}

ipcMain.handle('lyra:spotify-library', async (_e, kind: 'playlists' | 'liked' | 'albums' | 'artists') => {  if (kind === 'playlists') {
    const j = (await spotifyFetch('/me/playlists?limit=30')) as { items?: { id: string; name: string; tracks: { total: number }; images: { url: string }[] }[] };
    return (j.items ?? []).map((p) => ({ id: `spotify:playlist:${p.id}`, source: 'spotify', title: p.name, trackCount: p.tracks.total, coverUrl: p.images[0]?.url }));
  }
  if (kind === 'liked') {
    const j = (await spotifyFetch('/me/tracks?limit=50')) as { items?: { track: { id: string; name: string; artists: { name: string }[]; duration_ms: number; album: { images: { url: string }[] } } }[] };
    return (j.items ?? []).map((x) => ({ id: `spotify:${x.track.id}`, source: 'spotify', title: x.track.name, artist: x.track.artists.map((a) => a.name).join(', '), duration: Math.round(x.track.duration_ms / 1000), coverUrl: x.track.album.images[0]?.url }));
  }
  if (kind === 'albums') {
    const j = (await spotifyFetch('/me/albums?limit=30')) as { items?: { album: { id: string; name: string; artists: { name: string }[]; images: { url: string }[] } }[] };
    return (j.items ?? []).map((x) => ({ id: `spotify:album:${x.album.id}`, source: 'spotify', title: x.album.name, artist: x.album.artists.map((a) => a.name).join(', '), coverUrl: x.album.images[0]?.url }));
  }
  const j = (await spotifyFetch('/me/following?type=artist&limit=30')) as { artists?: { items?: { name: string; images: { url: string }[] }[] } };
  return ((j.artists?.items ?? []).map((a) => ({ name: a.name, coverUrl: a.images[0]?.url })));
});

ipcMain.handle('lyra:spotify-playlist-tracks', async (_e, playlistId: string) => {
  const id = String(playlistId).split(':').pop();
  const j = (await spotifyFetch(`/playlists/${id}/tracks?limit=100&fields=items(track(id,name,artists(name),duration_ms,album(images))))`)) as {
    items?: { track: { id: string; name: string; artists: { name: string }[]; duration_ms: number; album: { images: { url: string }[] } } }[];
  };
  return (j.items ?? []).filter((x) => x.track && !x.track.id.startsWith('episode')).map((x) => ({
    id: `spotify:${x.track.id}`, source: 'spotify', title: x.track.name,
    artist: x.track.artists.map((a) => a.name).join(', '),
    duration: Math.round(x.track.duration_ms / 1000), coverUrl: x.track.album.images[0]?.url,
  }));
});

// ---- misc ----
ipcMain.handle('lyra:notify', (_e, title: string, body: string) => { notify(title, body); return true; });
ipcMain.handle('lyra:mpris', (_e, kind: string, payload?: unknown) => {
  if (kind === 'track') mpris.updateTrack(payload as never);
  else if (kind === 'state') mpris.updateState(payload as 'Playing' | 'Paused' | 'Stopped');
  else if (kind === 'volume' && typeof payload === 'number') mpris.updateVolume(payload / 100);
  return true;
});
ipcMain.handle('lyra:ytdlp-version', async () => ytdlpVersion().catch((e: Error) => `error: ${e.message}`));
ipcMain.handle('lyra:ytdlp-update', async () => updateYtdlp().catch((e: Error) => `error: ${e.message}`));
ipcMain.handle('lyra:user-agent', () => userAgent());
ipcMain.handle('lyra:version', () => BOOT_ID);
ipcMain.handle('lyra:lyrics-lrclib', async (_e, title: string, artist: string) => {
  const u = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
  const r = await fetch(u, { headers: httpHeaders() });
  if (!r.ok) return null;
  return (await r.json()) as unknown;
});
ipcMain.handle('lyra:login', async (_e, which: 'soundcloud' | 'youtubemusic' | 'spotify') => {
  if (which === 'spotify') return false; // spotify uses lyra:spotify-oauth (system browser)
  const urls = {
    soundcloud: 'https://soundcloud.com/login',
    youtubemusic: 'https://accounts.google.com/',
  } as const;
  const w = openLoginWindow(urls[which], which, which, () => {
    clearInterval(poller);
    // user closed the window manually: still re-read session, notify UI
    void refreshAuthSession(which).finally(() => {
      if (win && !win.isDestroyed()) win.webContents.send('lyra:login-done', which);
    });
  });
  // auto-close: poll session cookies; when auth appears, close window + refresh UI
  const poller = setInterval(() => {
    void (async () => {
      try {
        const sess = sessionFor(which);
        const url = which === 'soundcloud' ? 'https://soundcloud.com' : 'https://www.youtube.com';
        const cs = await sess.cookies.get({ url });
        const hit = which === 'soundcloud'
          ? cs.some((c) => c.name === 'oauth_token')
          : cs.some((c) => ['SID', 'HSID'].includes(c.name) && (c.domain ?? '').includes('youtube.com'));
        if (hit && !w.isDestroyed()) {
          clearInterval(poller);
          w.close();
        }
      } catch { /* keep polling */ }
    })();
  }, 2000);
  return true;
});

/** Read login session: { connected, name? }. Exports cookies for yt-dlp when connected. */
ipcMain.handle('lyra:auth-status', async (_e, which: string) => {
  try {
    if (which === 'spotify') {
      if (!loadSecret('spotify-token')) return { connected: false };
      try {
        const me = (await spotifyFetch('/me')) as { display_name?: string };
        return { connected: true, name: me.display_name };
      } catch { return { connected: true }; }
    }
    const sess = sessionFor(which);
    if (which === 'soundcloud') {
      const cookies = await sess.cookies.get({ url: 'https://soundcloud.com' });
      const token = cookies.find((c) => c.name === 'oauth_token')?.value;
      if (!token) return { connected: false };
      try {
        const p = await exportCookiesFile(which);
        setCookiesFile(p);
      } catch { /* noop */ }
      return { connected: true, name: await soundcloudName(token) };
    }
    // youtubemusic: only cookies scoped to youtube.com count
    // (google.com SSO cookies from the login window must NOT mark YT as connected)
    const cookies = await sess.cookies.get({ url: 'https://www.youtube.com' });
    const sid = cookies.find((c) => ['SID', 'HSID', '__Secure-3PSID'].includes(c.name)
      && (c.domain ?? '').includes('youtube.com'));
    if (!sid) return { connected: false };
    try {
      const p = await exportCookiesFile(which);
      setCookiesFile(p);
    } catch { /* noop */ }
    return { connected: true, name: await youtubeName(cookies) };
  } catch {
    return { connected: false };
  }
});

/** Best-effort SoundCloud display name via OAuth /me endpoint. */
async function soundcloudName(token: string): Promise<string | undefined> {
  try {
    const r = await fetch('https://api-v2.soundcloud.com/me', {
      headers: { Authorization: `OAuth ${token}`, ...httpHeaders() },
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { username?: string; full_name?: string };
    return j.username || j.full_name || undefined;
  } catch { return undefined; }
}

/** Best-effort YouTube display name from the homepage account chip. */
async function youtubeName(cookies: Electron.Cookie[]): Promise<string | undefined> {
  try {
    const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const r = await fetch('https://www.youtube.com/', {
      headers: { Cookie: header, ...httpHeaders(), 'Accept-Language': 'en' },
    });
    if (!r.ok) return undefined;
    const html = await r.text();
    if (!/["']loggedIn["']\s*:\s*true/.test(html)) return undefined;
    const m = html.match(/"displayName":"([^"\\]{1,60})"/);
    return m?.[1];
  } catch { return undefined; }
}

// logout of ONE source: remove only its partition cookies (+ its secret files)
ipcMain.handle('lyra:auth-clear', (_e, keys: string[]) => {
  void (async () => {
    for (const k of keys) {
      try {
        const sess = sessionFor(k);
        for (const u of k === 'soundcloud' ? ['https://soundcloud.com'] : k === 'youtubemusic' ? ['https://www.youtube.com', 'https://accounts.google.com'] : []) {
          const cs = await sess.cookies.get({ url: u });
          await Promise.all(cs.map((c) => sess.cookies.remove(u, c.name).catch(() => undefined)));
        }
        await sess.clearCache().catch(() => undefined);
      } catch { /* noop */ }
    }
  })();
  clearSecrets(keys);
  return true;
});
ipcMain.handle('lyra:auth-save', (_e, k: string, v: string) => { saveSecret(k, v); return !usingFallback; });
ipcMain.handle('lyra:auth-load', (_e, k: string) => loadSecret(k) ?? null);
async function refreshAuthSession(which: string): Promise<void> {
  try {
    const p = await exportCookiesFile(which);
    setCookiesFile(p);
  } catch { /* noop */ }
}
ipcMain.handle('lyra:open-external', (_e, url: string) => { void shell.openExternal(url); return true; });

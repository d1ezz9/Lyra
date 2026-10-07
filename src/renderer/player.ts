import type { SourceId, Track } from '@common/types';
import { useStore } from './store';

type PlayRes = { ok: boolean; reason?: string; audioSource?: string; streamUrl?: string };

// ---- offline cache: files are named by URL hash (one URL = one file, structurally collision-free) ----
const cacheKey = 'lyra:cache2';
function urlHash(source: string, url: string): string {
  const s = `${source}|${url}`;
  let h1 = 0x811c9dc5; let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 + s.charCodeAt(i), 31);
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}
function readCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(cacheKey) ?? '{}') as Record<string, string>; }
  catch { return {}; }
}
function writeCache(hash: string, file: string): void {
  try { localStorage.setItem(cacheKey, JSON.stringify({ ...readCache(), [hash]: file })); }
  catch { /* noop */ }
}
export function dropCacheForUrl(source: string, url: string): void {
  try {
    const c = readCache();
    delete c[urlHash(source, url)];
    localStorage.setItem(cacheKey, JSON.stringify(c));
  } catch { /* noop */ }
}
export function dropCacheForFiles(files: string[]): void {
  try {
    const c = readCache();
    let changed = false;
    for (const [k, v] of Object.entries(c)) {
      if (files.includes(v)) { delete c[k]; changed = true; }
    }
    if (changed) localStorage.setItem(cacheKey, JSON.stringify(c));
  } catch { /* noop */ }
}
/** One-time purge: delete unreferenced junk (incl. poisoned files from old builds) from the cache dir. */
export async function purgeOrphanCache(): Promise<void> {
  try {
    if (localStorage.getItem('lyra:cache-purged-v2') === '1') return;
    const dir = (await window.lyra.cacheDir()) as string;
    const files = (await window.lyra.dlList()) as { path: string; size: number }[];
    const used = new Set(Object.values(readCache()));
    const orphans = files.map((f) => f.path).filter((p) => p.startsWith(dir) && !used.has(p));
    if (orphans.length) await window.lyra.dlDelete(orphans);
    localStorage.setItem('lyra:cache-purged-v2', '1');
  } catch { /* noop */ }
}

/** Boot prune: drop queue/playlist localPaths whose files no longer exist (no per-play errors). */
export async function pruneMissingLocal(): Promise<void> {
  try {
    const st = useStore.getState();
    const paths: string[] = [];
    st.queue.forEach((x) => { if (x.localPath) paths.push(x.localPath); });
    st.currentPlaylist?.tracks.forEach((x) => { if (x.localPath) paths.push(x.localPath); });
    if (!paths.length) return;
    const exists = (await window.lyra.filesExist(paths)) as boolean[];
    const gone = new Set(paths.filter((_, i) => !exists[i]));
    if (!gone.size) return;
    const clean = <T extends { localPath?: string }>(list: T[]): T[] =>
      list.map((x) => (x.localPath && gone.has(x.localPath) ? { ...x, localPath: undefined } : x));
    useStore.setState((s) => ({
      queue: clean(s.queue),
      current: s.current?.localPath && gone.has(s.current.localPath) ? { ...s.current, localPath: undefined } : s.current,
      currentPlaylist: s.currentPlaylist
        ? { ...s.currentPlaylist, tracks: clean(s.currentPlaylist.tracks) }
        : s.currentPlaylist,
    }));
  } catch { /* noop */ }
}
const pendingCache = new Map<string, string>(); // download id -> url hash
const pendingSingle = new Map<string, string>(); // download id -> track url
let cacheListening = false;
function ensureCacheListener(): void {
  if (cacheListening) return;
  cacheListening = true;
  const sub = window.lyra.onDownloadProgress as unknown as
    ((cb: (m: { id: string; status: string; file?: string }) => void) => void) | undefined;
  sub?.((m) => {
    const tid = pendingCache.get(m.id);
    if (tid) {
      if (m.status === 'done' && m.file) { writeCache(tid, m.file); pendingCache.delete(m.id); }
      else if (m.status === 'error') pendingCache.delete(m.id);
      return;
    }
    const url = pendingSingle.get(m.id);
    if (!url) return;
    if (m.status === 'done' && m.file) {
      pendingSingle.delete(m.id);
      const st = useStore.getState();
      useStore.setState({
        queue: st.queue.map((x) => (x.url === url ? { ...x, localPath: m.file } : x)),
      });
      st.setDownloads({ done: 1, total: 1 });
      st.snack(st.t('dlFinished'));
    } else if (m.status === 'error') {
      pendingSingle.delete(m.id);
      const st = useStore.getState();
      st.setDownloads(null);
      st.snack(st.t('dlFailed'));
    }
  });
}

/** Unique readable filename base: "Artist - Title [hash]" (same titles never collide). */
export function dlName(t: { artist: string; title: string; source: string; url?: string }): string {
  const clean = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'track';
  let h = 0x811c9dc5;
  const s = `${t.source}|${t.url ?? t.title}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${clean(t.artist)} - ${clean(t.title)} [${(h >>> 0).toString(16)}]`;
}

/** Single-track download from the ⋯ menu into ~/Music/Lyra; attaches localPath on done. */
export async function downloadTrack(track: Track): Promise<void> {
  const s = useStore.getState();
  if (!track.url && !track.localPath) { s.snack(s.t('playError')); return; }
  if (track.localPath) { s.snack(`${s.t('dlDone')} · ${s.t('dlSkipped')}`); return; }
  try {
    ensureCacheListener();
    const dir = (await window.lyra.dlDir()) as string;
    const fmt = useStore.getState().dlFormat;
    const id = (await window.lyra.downloadStart(track.url as string, fmt, dir, dlName(track))) as string;
    pendingSingle.set(id, track.url as string);
    s.setDownloads({ done: 0, total: 1 });
    s.snack(s.t('dlStarted'));
  } catch { s.snack(s.t('dlFailed')); }
}

async function cacheInBackground(t: Track, streamUrl: string): Promise<void> {
  try {
    if (!t.url) return;
    ensureCacheListener();
    const dir = (await window.lyra.cacheDir()) as string;
    if (!dir) return;
    const safe = `u_${urlHash(t.source, t.url)}`;
    if (readCache()[urlHash(t.source, t.url)]) return; // already cached
      const id = (await window.lyra.downloadStart(streamUrl, 'opus', dir, safe)) as string;
    pendingCache.set(id, urlHash(t.source, t.url));
  } catch { /* silent: caching is best-effort */ }
}

/** Play any track via main process (resolves streams, matches Spotify). Returns success. */
export async function playTrack(t: Track, retryOnline = true): Promise<boolean> {
  const s = useStore.getState();
  const cache = readCache();
  const chash = t.url ? urlHash(t.source, t.url) : null;
  const cached = !t.localPath && chash ? cache[chash] : undefined;
  const eff: Track = cached ? { ...t, localPath: cached } : t;
  let res: PlayRes;
  try {
    res = (await window.lyra.playTrack(eff, s.audioOrder)) as PlayRes;
  } catch {
    s.snack(s.t('playError'));
    return false;
  }
  if (!res?.ok) {
    if (res?.reason === 'superseded') return true; // a newer track took over: stay silent
    if (retryOnline && (res?.reason === 'local-gone' || res?.reason === 'local-mismatch')) {
      // stale/false local mapping: drop it and stream instead of going silent
      if (chash) {
        try {
          const c = readCache();
          delete c[chash];
          localStorage.setItem(cacheKey, JSON.stringify(c));
        } catch { /* noop */ }
      }
      useStore.setState((st) => ({
        queue: st.queue.map((x) => (x.id === t.id ? { ...x, localPath: undefined } : x)),
        current: st.current?.id === t.id ? { ...st.current, localPath: undefined } : st.current,
      }));
      return playTrack({ ...t, localPath: undefined }, false);
    }
    s.snack(s.t('playError'));
    return false;
  }
  if (res.audioSource) {
    useStore.setState((st) => ({
      queue: st.queue.map((x) => (x.id === t.id ? { ...x, audioSource: res.audioSource as Track['audioSource'] } : x)),
      current: st.current?.id === t.id ? { ...st.current, audioSource: res.audioSource as Track['audioSource'] } : st.current,
    }));
  }
  s.setPlaying(true);
  void window.lyra.mpris('track', t);
  void window.lyra.mpris('state', 'Playing');
  void window.lyra.mpris('volume', s.volume);
  void window.lyra.notify('Lyra', `${t.artist} — ${t.title}`);
  // while it plays, fetch it to the app folder so next time needs no service
  if (s.autoDownload && !eff.localPath && res.streamUrl) void cacheInBackground(t, res.streamUrl);
  pushHistory(t);
  return true;
}

const HISTORY_KEY = 'lyra:history';
export interface HistItem { id: string; title: string; artist: string; source: string; url?: string; coverUrl?: string; localPath?: string; }
function pushHistory(t: Track): void {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistItem[];
    const item: HistItem = { id: t.id, title: t.title, artist: t.artist, source: t.source, url: t.url, coverUrl: t.coverUrl, localPath: t.localPath };
    const next = [item, ...raw.filter((x) => x.id !== t.id)].slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch { /* noop */ }
}
export function readHistory(): HistItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistItem[];
    return raw.filter((x) => x && typeof x.title === 'string' && x.title.trim());
  } catch { return []; }
}

/** Play a single track: reuse queue position if already queued (no duplicates). */
export async function playSingle(tr: Track): Promise<void> {
  void window.lyra.uiLog(`click play "${tr.artist} — ${tr.title}" [${tr.id}]`).catch(() => undefined);
  const st = useStore.getState();
  const qi = st.queue.findIndex((x) => x.id === tr.id);
  if (qi >= 0) {
    await playIndex(qi);
    return;
  }
  st.enqueue([tr]);
  await playIndex(useStore.getState().queue.length - 1);
}
export async function playIndex(i: number): Promise<void> {
  const st = useStore.getState();
  void window.lyra.uiLog(`playIndex ${i} "${st.queue[i]?.artist} — ${st.queue[i]?.title}"`).catch(() => undefined);
  // disliked tracks never start on their own
  if (st.dislikes.includes(st.queue[i]?.id)) {
    for (let n = i + 1; n < st.queue.length; n++) {
      if (!st.queue[n].unavailable && !st.dislikes.includes(st.queue[n].id)) { await playIndex(n); return; }
    }
    return;
  }
  const tr = st.queue[i];
  if (!tr) return;
  st.setIndex(i);
  const ok = await playTrack(tr);
  if (!ok) {
    useStore.setState((s2) => ({
      queue: s2.queue.map((x, xi) => (xi === i ? { ...x, unavailable: s2.t('qNoMatch') } : x)),
    }));
    useStore.getState().snack(useStore.getState().t('qNoMatch'));
    const s3 = useStore.getState();
    for (let n = i + 1; n < s3.queue.length; n++) {
      if (!s3.queue[n].unavailable) { await playIndex(n); return; }
    }
  }
}

async function fadeTo(target: number, ms: number): Promise<void> {
  const from = useStore.getState().volume;
  const steps = Math.max(1, Math.round(ms / 60));
  for (let k = 1; k <= steps; k++) {
    const v = Math.round(from + ((target - from) * k) / steps);
    await window.lyra.control('volume', v);
    await new Promise((r) => setTimeout(r, ms / steps));
  }
}

/** Next/previous across the real queue (mpv holds a single file, so mpv next/prev can't work). */
export async function advance(dir: 1 | -1): Promise<void> {
  const st = useStore.getState();
  if (!st.queue.length) return;
  let next = st.index + dir;
  if (st.shuffle && dir === 1 && st.queue.length > 1) {
    let r = st.index;
    while (r === st.index) r = Math.floor(Math.random() * st.queue.length);
    next = r;
  }
  if (next < 0) {
    await window.lyra.control('seek', 0);
    return;
  }
  if (next >= st.queue.length) {
    if (st.repeat === 'all') next = 0;
    else {
      try { await window.lyra.control('pause'); } catch { /* noop */ }
      st.setPlaying(false);
      return;
    }
  }
  if (st.crossfade && st.crossfadeMs > 0) {
    const half = Math.min(2000, Math.floor(st.crossfadeMs / 2));
    await fadeTo(0, half);
    await playIndex(next);
    if (useStore.getState().playing) await fadeTo(useStore.getState().volume, half);
    else await window.lyra.control('volume', useStore.getState().volume);
  } else {
    await playIndex(next);
  }
}

export function pickSource(id: SourceId): void {
  useStore.getState().setSource(id);
}

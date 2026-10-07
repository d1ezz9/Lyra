import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import https from 'node:https';
import { userAgent } from '../../common/userAgent.js';

const run = promisify(execFile);
let cookiesPath: string | undefined;

export function setCookiesFile(p: string | undefined): void { cookiesPath = p; }
export function hasCookiesFile(): boolean { return !!cookiesPath && fs.existsSync(cookiesPath); }

/** Thin yt-dlp wrapper: resolve stream URL, search, metadata, download. */
export async function ytdlp(args: string[], withCookies = false): Promise<string> {
  const full = [...args];
  if (withCookies && cookiesPath) full.push('--cookies', cookiesPath);
  full.push('--no-warnings');
  const { stdout } = await run('yt-dlp', full, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function resolveStreamUrl(url: string, withCookies = false): Promise<string> {
  const out = await ytdlp(['-g', '-f', 'bestaudio/best', url], withCookies);
  return out.trim().split('\n')[0];
}

export interface YtEntry { id: string; title: string; artist?: string; duration?: number; thumbnail?: string; url: string; }

function entryUrl(j: { id?: string; url?: string; webpage_url?: string; ext?: string }): string {
  // flat search entries: prefer real page URL; bare `url` may be an API link or a bare video id
  if (j.webpage_url) return j.webpage_url;
  if (j.url?.startsWith('http') && !j.url.includes('api.soundcloud.com')) return j.url;
  if (j.id && /^[a-zA-Z0-9_-]{11}$/.test(j.id)) return `https://www.youtube.com/watch?v=${j.id}`;
  return j.url ?? '';
}

export async function searchFlat(query: string, limit = 10, withCookies = false): Promise<YtEntry[]> {
  // honour explicit prefixes (scsearchN:/ytsearchN:); default to YouTube search
  const site = query.startsWith('http') || /^(ytsearch|scsearch)\d*:/.test(query)
    ? query : `ytsearch${limit}:${query}`;
  // ytsearch works for YouTube; for SoundCloud callers pass scsearch: prefix themselves
  const out = await ytdlp(['--flat-playlist', '--dump-json', site], withCookies);
  const entries: YtEntry[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as { id?: string; title?: string; uploader?: string; artist?: string; duration?: number; thumbnails?: { url?: string }[]; webpage_url?: string; url?: string };
      entries.push({ id: j.id ?? '', title: j.title ?? '', artist: j.artist ?? j.uploader, duration: j.duration, thumbnail: j.thumbnails?.slice(-1)[0]?.url, url: entryUrl(j) });
    } catch { /* skip */ }
  }
  return entries;
}

export async function ytdlpVersion(): Promise<string> {
  return (await ytdlp(['--version'])).trim();
}

export async function updateYtdlp(): Promise<string> {
  try {
    return (await ytdlp(['-U'])).trim();
  } catch (e1) {
    // 403/rate-limit on self-update: try pip, then direct binary download
    try {
      const { stdout } = await run('pip', ['install', '--user', '-U', 'yt-dlp']);
      return `pip fallback: ${stdout.trim().slice(-300)}`;
    } catch { /* fall through */ }
    try {
      const { stdout: w } = await run('which', ['yt-dlp']).catch(() => ({ stdout: '' }) as never);
      const target = (w as string).trim() || `${process.env.HOME}/.local/bin/yt-dlp`;
      await new Promise<void>((resolve, reject) => {
        https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', (res) => {
          if (res.statusCode !== 200) { reject(new Error(`http ${res.statusCode}`)); return; }
          const f = fs.createWriteStream(target, { mode: 0o755 });
          res.pipe(f);
          f.on('finish', () => resolve());
          f.on('error', reject);
        }).on('error', reject);
      });
      return `binary reinstalled to ${target}`;
    } catch (e2) {
      throw new Error(`update failed: ${String(e1).slice(0, 120)} / ${String(e2).slice(0, 120)}`);
    }
  }
}

export function httpHeaders(): Record<string, string> {
  return { 'User-Agent': userAgent(), Accept: 'application/json' };
}

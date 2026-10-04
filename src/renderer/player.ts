import type { SourceId, Track } from '@common/types';
import { useStore } from './store';

type PlayRes = { ok: boolean; reason?: string; audioSource?: string; streamUrl?: string };

// ---- offline cache: downloaded tracks play from disk, service isn't hit again ----
const cacheKey = 'lyra:cache';
function readCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(cacheKey) ?? '{}') as Record<string, string>; }
  catch { return {}; }
}
function writeCache(trackId: string, file: string): void {
  try { localStorage.setItem(cacheKey, JSON.stringify({ ...readCache(), [trackId]: file })); }
  catch { /* noop */ }
}
const pendingCache = new Map<string, string>(); // download id -> track id
let cacheListening = false;
function ensureCacheListener(): void {
  if (cacheListening) return;
  cacheListening = true;
  const sub = window.lyra.onDownloadProgress as unknown as
    ((cb: (m: { id: string; status: string; file?: string }) => void) => void) | undefined;
  sub?.((m) => {
    const tid = pendingCache.get(m.id);
    if (!tid) return;
    if (m.status === 'done' && m.file) { writeCache(tid, m.file); pendingCache.delete(m.id); }
    else if (m.status === 'error') pendingCache.delete(m.id);
  });
}

async function cacheInBackground(t: Track, streamUrl: string): Promise<void> {
  try {
    ensureCacheListener();
    const dir = (await window.lyra.cacheDir()) as string;
    if (!dir) return;
    const safe = t.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const id = (await window.lyra.downloadStart(streamUrl, 'opus', dir, safe)) as string;
    pendingCache.set(id, t.id);
  } catch { /* silent: caching is best-effort */ }
}

/** Play any track via main process (resolves streams, matches Spotify). Returns success. */
export async function playTrack(t: Track): Promise<boolean> {
  const s = useStore.getState();
  const cached = !t.localPath && readCache()[t.id];
  const eff: Track = cached ? { ...t, localPath: cached } : t;
  let res: PlayRes;
  try {
    res = (await window.lyra.playTrack(eff, s.audioOrder)) as PlayRes;
  } catch {
    s.snack(s.t('playError'));
    return false;
  }
  if (!res?.ok) {
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
  return true;
}

/** Play queue item i; on failure mark it and continue to the next playable. */
export async function playIndex(i: number): Promise<void> {
  const st = useStore.getState();
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

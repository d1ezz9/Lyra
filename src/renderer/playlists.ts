import type { Track } from '@common/types';
import { useStore } from './store';

const key = (playlistId: string): string => `lyra:pldir:${playlistId}`;

export function getPlaylistFolder(playlistId: string): string | null {
  try { return localStorage.getItem(key(playlistId)); } catch { return null; }
}
export function setPlaylistFolder(playlistId: string, folder: string): void {
  try { localStorage.setItem(key(playlistId), folder); } catch { /* noop */ }
}

/** Attach localPath to tracks already present in folder (no re-download). */
export async function attachLocal(folder: string, tracks: Track[]): Promise<Track[]> {
  try {
    const found = (await window.lyra.findLocal(folder, tracks.map((x) => ({ title: x.title, artist: x.artist, duration: x.duration })))) as (string | null)[];
    return tracks.map((x, i) => (found[i] ? { ...x, localPath: found[i] as string } : x));
  } catch { return tracks; }
}

/** Open a playlist page: reuse remembered folder + local files, navigate (no autoplay). */
export async function openPlaylistWithLocal(playlistId: string, source: string, title: string, tracks: Track[]): Promise<void> {
  const s = useStore.getState();
  const clean = tracks.filter((x) => x && typeof x.title === 'string' && x.title.trim());
  const folder = getPlaylistFolder(`${source}:${playlistId}`) ?? getPlaylistFolder(playlistId);
  const list = folder ? await attachLocal(folder, clean) : clean;
  s.setCurrentPlaylist({ title, tracks: list });
  s.setScreen('playlist');
}

export interface DlProgress { done: number; total: number; skipped: number; }

/** Download whole playlist with folder choice, skipping already-local tracks (max 3 parallel). */
export async function downloadPlaylist(
  playlistId: string, tracks: Track[], onTick: (p: DlProgress) => void,
): Promise<Track[]> {
  const folder = (await window.lyra.pickFolder()) as string | null;
  if (!folder) return tracks;
  setPlaylistFolder(playlistId, folder);
  let list = await attachLocal(folder, tracks);
  const pending = list.map((x, i) => ({ x, i })).filter(({ x }) => !x.localPath && x.url);
  let done = 0; const total = pending.length; const skipped = list.length - total;
  const report = (): void => {
    useStore.getState().setDownloads(total > 0 ? { done: done + skipped, total: list.length } : null);
  };
  report();
  const idToTrack = new Map<string, string>();
  const progressHandler = (m: { id: string; status: string; file?: string }): void => {
    const trackId = idToTrack.get(m.id);
    if (trackId === undefined) return;
    if (m.status === 'done') {
      done++;
      report();
      if (m.file) {
        // match by TRACK ID, never by queue index (indices shift, ids don't)
        useStore.setState((st) => ({
          queue: st.queue.map((q) => (q.id === trackId ? { ...q, localPath: m.file } : q)),
          current: st.current?.id === trackId ? { ...st.current, localPath: m.file } : st.current,
          currentPlaylist: st.currentPlaylist
            ? { ...st.currentPlaylist, tracks: st.currentPlaylist.tracks.map((x) => (x.id === trackId ? { ...x, localPath: m.file } : x)) }
            : st.currentPlaylist,
        }));
        list = list.map((x) => (x.id === trackId ? { ...x, localPath: m.file } : x));
      }
      onTick({ done, total, skipped });
    } else if (m.status === 'error') {
      done++;
      report();
      onTick({ done, total, skipped });
    }
  };
  (window.lyra.onDownloadProgress as unknown as (cb: (m: { id: string; status: string; file?: string }) => void) => void)(progressHandler);
  const worker = async (items: { x: Track; i: number }[]): Promise<void> => {
    const { dlName } = await import('./player');
    const fmt = useStore.getState().dlFormat;
    for (const { x } of items) {
      if (!x.url) continue;
      const id = (await window.lyra.downloadStart(x.url, fmt, folder, dlName(x))) as string;
      idToTrack.set(id, x.id);
    }
  };
  const chunks: { x: Track; i: number }[][] = [[], [], []];
  pending.forEach((p, k) => chunks[k % 3].push(p));
  await Promise.all(chunks.map(worker));
  return list;
}

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
    const found = (await window.lyra.findLocal(folder, tracks.map((x) => ({ title: x.title, artist: x.artist })))) as (string | null)[];
    return tracks.map((x, i) => (found[i] ? { ...x, localPath: found[i] as string } : x));
  } catch { return tracks; }
}

/** Open a playlist page: reuse remembered folder + local files, navigate (no autoplay). */
export async function openPlaylistWithLocal(playlistId: string, source: string, title: string, tracks: Track[]): Promise<void> {
  const s = useStore.getState();
  const folder = getPlaylistFolder(`${source}:${playlistId}`) ?? getPlaylistFolder(playlistId);
  const list = folder ? await attachLocal(folder, tracks) : tracks;
  s.setCurrentPlaylist({ title, tracks: list });
  s.setScreen('playlist');
}

export interface DlProgress { done: number; total: number; skipped: number; }

/** Download whole playlist with folder choice, skipping already-local tracks (max 3 parallel). */
export async function downloadPlaylist(
  playlistId: string, tracks: Track[], format: string, onTick: (p: DlProgress) => void,
): Promise<Track[]> {
  const folder = (await window.lyra.pickFolder()) as string | null;
  if (!folder) return tracks;
  setPlaylistFolder(playlistId, folder);
  let list = await attachLocal(folder, tracks);
  const pending = list.map((x, i) => ({ x, i })).filter(({ x }) => !x.localPath && x.url);
  let done = 0; const total = pending.length; let skipped = list.length - total;
  onTick({ done, total, skipped });
  const idToIndex = new Map<string, number>();
  const progressHandler = (m: { id: string; status: string; file?: string }): void => {
    const qi = idToIndex.get(m.id);
    if (qi === undefined) return;
    if (m.status === 'done') {
      done++;
      if (m.file) {
        useStore.setState((st) => ({
          queue: st.queue.map((q, idx) => (idx === qi ? { ...q, localPath: m.file } : q)),
        }));
        list = list.map((x, li) => (li === qi - base ? { ...x, localPath: m.file } : x));
      }
      onTick({ done, total, skipped });
    }
  };
  (window.lyra.onDownloadProgress as unknown as (cb: (m: { id: string; status: string; file?: string }) => void) => void)(progressHandler);
  // queue indices at enqueue time
  const st = useStore.getState();
  const base = st.queue.length;
  st.enqueue(list);
  const worker = async (items: { x: Track; i: number }[]): Promise<void> => {
    for (const { x, i } of items) {
      if (!x.url) continue;
      const id = (await window.lyra.downloadStart(x.url, format, folder)) as string;
      idToIndex.set(id, base + i);
    }
  };
  const chunks: { x: Track; i: number }[][] = [[], [], []];
  pending.forEach((p, k) => chunks[k % 3].push(p));
  await Promise.all(chunks.map(worker));
  return list;
}

import type { Track } from '@common/types';
import { useStore } from './store';
import { readHistory } from './player';

/** "My wave": endless-ish radio from likes (artists + title keywords), dislikes excluded. */
export async function buildWave(count = 25, excludeIds: string[] = []): Promise<Track[]> {
  const st = useStore.getState();
  const liked = st.likes.filter((x) => x.title?.trim());
  const have = new Set<string>([...excludeIds, ...st.dislikes]);
  const out: Track[] = [];
  const push = (t: Track): void => {
    const key = `${t.artist} — ${t.title}`.toLowerCase();
    if (have.has(t.id) || have.has(key)) return;
    have.add(t.id); have.add(key);
    out.push(t);
  };
  const seeds: { artist: string; title: string }[] = liked.length
    ? liked.map((x) => ({ artist: x.artist, title: x.title }))
    : readHistory().slice(0, 10).map((x) => ({ artist: x.artist, title: x.title }));
  const searchSrc = (st.audioOrder.find((x) => x === 'soundcloud' || x === 'youtubemusic') ?? 'soundcloud') as 'soundcloud' | 'youtubemusic';
  const queries: string[] = [];
  for (const s of seeds.slice(0, 12)) {
    if (s.artist && s.artist !== 'Unknown') queries.push(s.artist);
    const words = s.title.split(/\s+/).filter((w) => w.length > 4).slice(0, 2).join(' ');
    if (words) queries.push(`${s.artist} ${words}`);
  }
  if (!queries.length) {
    // no likes yet: trending of the current platform
    try {
      const charts = (await window.lyra.scCharts()) as Track[];
      charts.slice(0, count).forEach(push);
    } catch { /* noop */ }
    return out;
  }
  for (const q of queries) {
    if (out.length >= count) break;
    try {
      const list = (await window.lyra.search(q, searchSrc)) as Track[];
      for (const t of list.slice(0, 4)) {
        if (out.length >= count) break;
        if (t.title?.trim()) push(t);
      }
    } catch { /* skip */ }
  }
  return out;
}

/** Start (or extend) the wave and show it as a playlist page. */
export async function startWave(): Promise<void> {
  const st = useStore.getState();
  const current = st.currentPlaylist?.id === 'wave' ? st.currentPlaylist.tracks : [];
  const tracks = await buildWave(25, current.map((x) => x.id));
  if (!tracks.length) { st.snack(st.t('waveHint')); return; }
  st.setCurrentPlaylist({ id: 'wave', title: st.t('waveTitle'), tracks: [...current, ...tracks] });
  st.setScreen('playlist');
}

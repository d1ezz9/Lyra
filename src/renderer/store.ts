import { create } from 'zustand';
import type { Track, SourceId } from '@common/types';
import { strings, detectLang, type Lang, type Key } from './i18n';

export type Screen = 'home' | 'search' | 'playlists' | 'playlist' | 'settings' | 'nowplaying';
export type ThemeId = 'mono-light' | 'mono-dark' | 'nord-light' | 'nord-dark' | 'material-light' | 'material-dark'
  | 'spotify' | 'soundcloud-light' | 'soundcloud-dark' | 'catppuccin' | 'gruvbox' | 'dracula' | 'dynamic';

interface State {
  screen: Screen; setScreen: (s: Screen) => void;
  theme: ThemeId; setTheme: (t: ThemeId) => void; followSystem: boolean; setFollowSystem: (b: boolean) => void;
  lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string;
  source: SourceId; setSource: (s: SourceId) => void;
  queue: Track[]; index: number; enqueue: (t: Track[]) => void; setIndex: (i: number) => void; clear: () => void;
  current: Track | undefined; playing: boolean; setPlaying: (b: boolean) => void;
  volume: number; setVolume: (v: number) => void;
  snackbar: string | null; snack: (m: string) => void;
  audioOrder: SourceId[]; setAudioOrder: (o: SourceId[]) => void;
  spotifyAcknowledged: boolean; setSpotifyAcknowledged: (b: boolean) => void;
  shuffle: boolean; toggleShuffle: () => void;
  repeat: 'off' | 'all' | 'one'; cycleRepeat: () => void;
  localFolders: string[]; setLocalFolders: (f: string[]) => void;
  autoDownload: boolean; setAutoDownload: (b: boolean) => void;
  crossfade: boolean; setCrossfade: (b: boolean) => void;
  crossfadeMs: number; setCrossfadeMs: (ms: number) => void;
  widgets: { cont: boolean; charts: boolean; shortcuts: boolean; recent: boolean; stats: boolean };
  setWidget: (k: 'cont' | 'charts' | 'shortcuts' | 'recent' | 'stats', b: boolean) => void;
  widgetsOrder: string[]; moveWidget: (k: string, dir: -1 | 1) => void;
  currentPlaylist: { id?: string; title: string; tracks: Track[] } | null;
  setCurrentPlaylist: (p: { id?: string; title: string; tracks: Track[] } | null) => void;
  likes: Track[]; toggleLike: (t: Track) => void; isLiked: (id: string) => boolean;
  dislikes: string[]; toggleDislike: (id: string) => void;
  myplaylists: { id: string; title: string; tracks: Track[] }[];
  createPlaylist: (title: string) => string;
  renamePlaylist: (id: string, title: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, t: Track) => void;
  removeFromPlaylist: (id: string, trackId: string) => void;
  downloads: { done: number; total: number } | null; setDownloads: (d: { done: number; total: number } | null) => void;
  dlFormat: string; setDlFormat: (f: string) => void;
}

const saved = (k: string, d: string) => localStorage.getItem(`lyra:${k}`) ?? d;

const loadQueue = (): { items: Track[]; index: number } => {
  try {
    const raw = JSON.parse(localStorage.getItem('lyra:queue') ?? 'null') as { items?: Track[]; index?: number } | null;
    if (raw && Array.isArray(raw.items)) {
      // drop stale junk (entries without title from older builds)
      const items = raw.items.filter((x) => x && typeof x.title === 'string' && x.title.trim()).slice(0, 500);
      return { items, index: Math.min(raw.index ?? 0, Math.max(0, items.length - 1)) };
    }
  } catch { /* noop */ }
  return { items: [], index: 0 };
};
const persistQueue = (items: Track[], index: number): void => {
  try { localStorage.setItem('lyra:queue', JSON.stringify({ items: items.slice(0, 500), index })); }
  catch { /* noop */ }
};
const initialQueue = loadQueue();

export const useStore = create<State>((set, get) => ({
  screen: 'home',
  setScreen: (screen) => set({ screen }),
  theme: (saved('theme', 'mono-dark') as ThemeId),
  setTheme: (theme) => { localStorage.setItem('lyra:theme', theme); set({ theme }); },
  followSystem: saved('follow-system', '0') === '1',
  setFollowSystem: (b) => { localStorage.setItem('lyra:follow-system', b ? '1' : '0'); set({ followSystem: b }); },
  lang: (localStorage.getItem('lyra:lang') as Lang | null) ?? detectLang(),
  setLang: (lang) => { localStorage.setItem('lyra:lang', lang); set({ lang }); },
  t: (k) => strings[get().lang][k],
  source: (saved('source', 'soundcloud') as SourceId),
  setSource: (source) => { localStorage.setItem('lyra:source', source); set({ source }); },
  queue: initialQueue.items, index: initialQueue.index,
  current: initialQueue.items[initialQueue.index],
  enqueue: (t) => {
    // never let title-less junk into the queue (renders as empty/undefined rows)
    const clean = t.filter((x) => x && typeof x.title === 'string' && x.title.trim());
    if (!clean.length) return;
    const items = [...get().queue, ...clean];
    persistQueue(items, get().index);
    set({ queue: items });
  },
  setIndex: (index) => {
    persistQueue(get().queue, index);
    set({ index, current: get().queue[index] });
  },
  clear: () => { persistQueue([], 0); set({ queue: [], index: 0, current: undefined }); },
  playing: false,
  setPlaying: (playing) => set({ playing }),
  volume: Number(saved('volume', '80')),
  setVolume: (volume) => { localStorage.setItem('lyra:volume', String(volume)); set({ volume }); },
  snackbar: null, snack: (m) => set({ snackbar: m }),
  audioOrder: JSON.parse(localStorage.getItem('lyra:audio-order') ?? '["soundcloud","youtubemusic"]') as SourceId[],
  setAudioOrder: (audioOrder) => { localStorage.setItem('lyra:audio-order', JSON.stringify(audioOrder)); set({ audioOrder }); },
  spotifyAcknowledged: localStorage.getItem('lyra:spotify-ack') === '1',
  setSpotifyAcknowledged: (b) => { localStorage.setItem('lyra:spotify-ack', b ? '1' : '0'); set({ spotifyAcknowledged: b }); },
  shuffle: false,
  toggleShuffle: () => set({ shuffle: !get().shuffle }),
  repeat: 'off',
  cycleRepeat: () => set({ repeat: get().repeat === 'off' ? 'all' : get().repeat === 'all' ? 'one' : 'off' }),
  localFolders: JSON.parse(localStorage.getItem('lyra:folders') ?? '[]') as string[],
  setLocalFolders: (f) => { localStorage.setItem('lyra:folders', JSON.stringify(f)); set({ localFolders: f }); },
  autoDownload: localStorage.getItem('lyra:autodl') !== '0',
  setAutoDownload: (b) => { localStorage.setItem('lyra:autodl', b ? '1' : '0'); set({ autoDownload: b }); },
  crossfade: localStorage.getItem('lyra:fade') === '1',
  setCrossfade: (b) => { localStorage.setItem('lyra:fade', b ? '1' : '0'); set({ crossfade: b }); },
  crossfadeMs: Number(localStorage.getItem('lyra:fade-ms') ?? '1500'),
  setCrossfadeMs: (ms) => { localStorage.setItem('lyra:fade-ms', String(ms)); set({ crossfadeMs: ms }); },
  widgets: { cont: true, charts: true, shortcuts: true, recent: true, stats: false, ...(JSON.parse(localStorage.getItem('lyra:widgets') ?? '{}') as object) } as State['widgets'],
  setWidget: (k, b) => {
    const widgets = { ...get().widgets, [k]: b };
    localStorage.setItem('lyra:widgets', JSON.stringify(widgets));
    set({ widgets });
  },
  widgetsOrder: JSON.parse(localStorage.getItem('lyra:widgets-order') ?? '["cont","charts","shortcuts","recent","stats"]') as string[],
  moveWidget: (k, dir) => {
    const order = [...get().widgetsOrder];
    const i = order.indexOf(k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    localStorage.setItem('lyra:widgets-order', JSON.stringify(order));
    set({ widgetsOrder: order });
  },
  currentPlaylist: null,
  setCurrentPlaylist: (p) => set({ currentPlaylist: p }),
  likes: JSON.parse(localStorage.getItem('lyra:likes') ?? '[]') as Track[],
  toggleLike: (t) => {
    const likes = get().likes.some((x) => x.id === t.id)
      ? get().likes.filter((x) => x.id !== t.id)
      : [...get().likes, { ...t }].slice(-500);
    localStorage.setItem('lyra:likes', JSON.stringify(likes));
    set({ likes });
  },
  isLiked: (id) => get().likes.some((x) => x.id === id),
  dislikes: JSON.parse(localStorage.getItem('lyra:dislikes') ?? '[]') as string[],
  toggleDislike: (id) => {
    const has = get().dislikes.includes(id);
    const dislikes = has ? get().dislikes.filter((x) => x !== id) : [...get().dislikes, id];
    localStorage.setItem('lyra:dislikes', JSON.stringify(dislikes));
    set({ dislikes });
  },
  myplaylists: JSON.parse(localStorage.getItem('lyra:myplaylists') ?? '[]') as { id: string; title: string; tracks: Track[] }[],
  createPlaylist: (title) => {
    const id = `user:${Date.now().toString(36)}`;
    const myplaylists = [...get().myplaylists, { id, title: title.trim() || 'Playlist', tracks: [] }];
    localStorage.setItem('lyra:myplaylists', JSON.stringify(myplaylists));
    set({ myplaylists });
    return id;
  },
  renamePlaylist: (id, title) => {
    const myplaylists = get().myplaylists.map((p) => (p.id === id ? { ...p, title } : p));
    localStorage.setItem('lyra:myplaylists', JSON.stringify(myplaylists));
    set({ myplaylists });
    const cp = get().currentPlaylist;
    if (cp?.id === id) set({ currentPlaylist: { ...cp, title } });
  },
  deletePlaylist: (id) => {
    const myplaylists = get().myplaylists.filter((p) => p.id !== id);
    localStorage.setItem('lyra:myplaylists', JSON.stringify(myplaylists));
    set({ myplaylists });
  },
  addToPlaylist: (id, t) => {
    const myplaylists = get().myplaylists.map((p) => (p.id === id && !p.tracks.some((x) => x.id === t.id)
      ? { ...p, tracks: [...p.tracks, { ...t }] } : p));
    localStorage.setItem('lyra:myplaylists', JSON.stringify(myplaylists));
    set({ myplaylists });
    const cp = get().currentPlaylist;
    if (cp?.id === id) set({ currentPlaylist: { ...cp, tracks: [...cp.tracks, { ...t }] } });
  },
  removeFromPlaylist: (id, trackId) => {
    const myplaylists = get().myplaylists.map((p) => (p.id === id
      ? { ...p, tracks: p.tracks.filter((x) => x.id !== trackId) } : p));
    localStorage.setItem('lyra:myplaylists', JSON.stringify(myplaylists));
    set({ myplaylists });
    const cp = get().currentPlaylist;
    if (cp?.id === id) set({ currentPlaylist: { ...cp, tracks: cp.tracks.filter((x) => x.id !== trackId) } });
  },
  downloads: null,
  setDownloads: (d) => set({ downloads: d }),
  dlFormat: localStorage.getItem('lyra:dl-format') ?? 'opus',
  setDlFormat: (f) => { localStorage.setItem('lyra:dl-format', f); set({ dlFormat: f }); },
}));

// persist queue/index on every change (covers direct setState patches too)
useStore.subscribe((st, prev) => {
  if (st.queue !== prev.queue || st.index !== prev.index) persistQueue(st.queue, st.index);
});

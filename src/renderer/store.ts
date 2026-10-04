import { create } from 'zustand';
import type { Track, SourceId } from '@common/types';
import { strings, detectLang, type Lang, type Key } from './i18n';

export type Screen = 'home' | 'search' | 'playlists' | 'playlist' | 'queue' | 'downloads' | 'settings' | 'nowplaying';
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
  widgets: { cont: boolean; charts: boolean; shortcuts: boolean }; setWidget: (k: 'cont' | 'charts' | 'shortcuts', b: boolean) => void;
  currentPlaylist: { title: string; tracks: Track[] } | null; setCurrentPlaylist: (p: { title: string; tracks: Track[] } | null) => void;
}

const saved = (k: string, d: string) => localStorage.getItem(`lyra:${k}`) ?? d;

const loadQueue = (): { items: Track[]; index: number } => {
  try {
    const raw = JSON.parse(localStorage.getItem('lyra:queue') ?? 'null') as { items?: Track[]; index?: number } | null;
    if (raw && Array.isArray(raw.items)) return { items: raw.items.slice(0, 500), index: Math.min(raw.index ?? 0, Math.max(0, raw.items.length - 1)) };
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
  theme: (saved('theme', 'material-dark') as ThemeId),
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
    const items = [...get().queue, ...t];
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
  widgets: { cont: true, charts: true, shortcuts: true, ...(JSON.parse(localStorage.getItem('lyra:widgets') ?? '{}') as object) } as State['widgets'],
  setWidget: (k, b) => {
    const widgets = { ...get().widgets, [k]: b };
    localStorage.setItem('lyra:widgets', JSON.stringify(widgets));
    set({ widgets });
  },
  currentPlaylist: null,
  setCurrentPlaylist: (p) => set({ currentPlaylist: p }),
}));

// persist queue/index on every change (covers direct setState patches too)
useStore.subscribe((st, prev) => {
  if (st.queue !== prev.queue || st.index !== prev.index) persistQueue(st.queue, st.index);
});

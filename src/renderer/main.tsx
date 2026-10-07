import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Browser fallback (vite dev / preview without Electron preload): no-op API
// so the UI renders and can be inspected outside the desktop shell.
if (!window.lyra) {
  const noop = async (): Promise<null> => null;
  window.lyra = {
    control: noop, playTrack: noop, search: async () => [], spotifySearch: async () => [],
    localPick: noop, localScan: async () => [], downloadStart: async () => '',
    downloadCancel: noop, onDownloadProgress: () => undefined,
    pickFolder: async () => null, findLocal: async () => [], cacheDir: async () => '',
    notify: noop, mpris: noop,
    login: noop, spotifyOauth: async () => false, spotifyLibrary: async () => [], spotifyPlaylistTracks: async () => [],
    scLibrary: async () => [], scCharts: async () => [], searchPlaylists: async () => [],
    playlistTracks: async () => [], playlistCovers: async () => [], win: async () => null,
    authStatus: async () => ({ connected: false }), onLoginDone: () => undefined,
    authClear: noop, defaultMusicDir: async () => '',
    sidecarLyrics: async () => null,
    ytdlpVersion: async () => 'dev', ytdlpUpdate: async () => 'dev',
    userAgent: async () => 'Lyra/dev', appVersion: async () => 'dev', lyrics: noop,
    onEnded: () => undefined, onMpv: () => undefined,
    dlDir: async () => '', dlList: async () => [], dlDelete: async () => 0, readLog: async () => [], filesExist: async () => [], uiLog: async () => true,
  } as unknown as Window['lyra'];
}

createRoot(document.getElementById('root')!).render(<App />);

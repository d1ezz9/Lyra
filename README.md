# Lyra

A desktop music player for Linux, distributed as `.AppImage`.

## Features

- **Four sources, one queue** — Local files, SoundCloud, YouTube Music, Spotify catalog. One active source at a time (Settings → Source, or `Ctrl+1…4`); queues and playlists mix tracks from anywhere.
- **Real playback** — mpv with gapless queue, shuffle, repeat, seek, volume, replay-gain, fade in/out.
- **Smart audio matching** — Spotify has no audio API for third-party players, so Lyra resolves sound on SoundCloud → YouTube Music (configurable, automatic fallback). DRM / preview / geo-blocked / deleted tracks are re-matched on another platform instead of failing silently.
- **Downloads** — single tracks or whole playlists via yt-dlp (`opus`/`mp3`/`m4a`/`flac`, tags + cover embedded), live progress, already-local tracks are reused, never re-downloaded.
- **Synced lyrics** — sidecar `.lrc` → LRCLIB → plain text, karaoke view with auto-centering.
- **Material Design 3** — 13 token-based themes with live preview, dynamic cover-art theme, dark/light/system.
- **Linux-native** — MPRIS2 (`playerctl` works), notifications, tray, XDG paths, custom frameless window.
- **Languages** — English / Russian, auto-detected.

## Install

Download `Lyra-<version>-x86_64.AppImage` from releases, make it executable, run. Requires system `mpv`, `yt-dlp`, `ffmpeg`.

```bash
chmod +x Lyra-0.1.0-x86_64.AppImage
./Lyra-0.1.0-x86_64.AppImage
```

## Build from source

```bash
npm install
npm run typecheck && npm test
npm run dist   # → dist/Lyra-<version>-x86_64.AppImage
```

## Accounts (all optional)

| Source | Login | Gives you |
|---|---|---|
| SoundCloud | in-app window | likes, playlists, private tracks, Go+ catalog |
| YouTube Music | in-app window | library, likes, playlists (prefer a secondary Google account) |
| Spotify | system browser (OAuth PKCE) | playlists, liked tracks, albums, artists, profile name |

Spotify needs a client ID: set `LYRA_SPOTIFY_CLIENT_ID` (PKCE login, no secret required). Catalog search without login additionally needs `LYRA_SPOTIFY_CLIENT_SECRET`.

Secrets live in the OS keyring (`safeStorage`); cookies are passed to yt-dlp only when actually needed.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).

## Notes

- New theme = one object in `src/renderer/themes.ts`.
- Local library: pick folders, tags are read with `music-metadata`, index in SQLite.
- Content rights stay with the user.

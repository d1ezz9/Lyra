# PLAN.md — Lyra

## Этапы
1. ~~План + DECISIONS~~ (этот файл).
2. Каркас Electron+TS+React, сборка AppImage, временная иконка-заглушка. Лого: 3 SVG в `docs/logo-options/` + `preview.html`, стоп на выбор.
3. Ядро: mpv (spawn + JSON IPC), локальные файлы, очередь (shuffle/repeat), SQLite индекс.
4. Темы (CSS-токены, 10+ тем, динамическая из обложки) + основной UI + переключатель платформ (Ctrl+1..5).
5. yt-dlp обёртка: SoundCloud (default) — поиск/стрим/скачивание.
6. YouTube Music через yt-dlp search + InnerTube-совместимый слой.
7. Auth: BrowserWindow + safeStorage (libsecret, fallback — шифрованный файл), SoundCloud/YT cookies → yt-dlp.
8. Spotify: OAuth PKCE (client_id из настроек/ENV), импорт, матчинг SC→YTM, диалог-предупреждение, кандидаты, ленивый матчинг.
9. Тексты (sidecar→USLT/SYLT→LRCLIB→plain, кэш SQLite, караоке-UI) + обложки (теги→папка→API→MusicBrainz/CAA, кэш+thumbs).
10. MPRIS2, пограничные случаи (2d), утверждённый логотип, README, полировка.

Проверка после каждого этапа: `npm run typecheck && npm run test && npm run dev` smoke + `npm run dist` на этапах 2 и 10.

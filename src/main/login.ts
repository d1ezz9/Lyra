import { BrowserWindow, session } from 'electron';

/** One session partition per source — logging out of one never touches the others. */
export function partitionFor(source: string): string {
  return `persist:lyra-auth-${source}`;
}

/** OAuth/login via embedded window with isolated per-source session. Passwords never touch app UI.
 *  System browser is intentionally NOT used: SoundCloud/YT auth artifacts live in cookies that
 *  the app must read back — impossible from an external browser without manual copy-paste. */
export function openLoginWindow(url: string, source: string, title: string, onDone: () => void): BrowserWindow {
  const win = new BrowserWindow({
    width: 480, height: 640, title: `Lyra — ${title}`,
    webPreferences: { partition: partitionFor(source), nodeIntegration: false, contextIsolation: true },
  });
  void win.loadURL(url);
  win.on('closed', () => onDone());
  return win;
}

export function spotifyAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:8899/callback',
    code_challenge_method: 'S256',
    code_challenge: 'lyra-placeholder',
    scope: 'user-library-read playlist-read-private playlist-read-collaborative user-follow-read',
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

export function sessionFor(source: string): Electron.Session {
  return session.fromPartition(partitionFor(source));
}

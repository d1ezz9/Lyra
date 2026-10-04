import { app } from 'electron';
import path from 'node:path';

export function xdgDir(kind: 'config' | 'cache' | 'data'): string {
  const home = process.env.HOME ?? app.getPath('home');
  if (kind === 'config') return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'lyra');
  if (kind === 'cache') return path.join(process.env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'lyra');
  return path.join(process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), 'lyra');
}

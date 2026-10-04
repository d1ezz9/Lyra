import { safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { xdgDir } from './paths.js';

/** Token/cookie vault: safeStorage → libsecret; fallback AES-256-GCM file + UI warning. */
const FALLBACK = 'auth-fallback.json';
export let usingFallback = false;

function fallbackPath(): string {
  const d = xdgDir('config'); fs.mkdirSync(d, { recursive: true });
  return path.join(d, FALLBACK);
}

function machineKey(): Buffer {
  return crypto.createHash('sha256').update(process.env.USER ?? 'lyra').digest();
}

export function saveSecret(key: string, value: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    // stored via session cookies / simple file of encrypted blobs
    const dir = xdgDir('config'); fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `secret-${key}.bin`);
    fs.writeFileSync(p, safeStorage.encryptString(value));
    usingFallback = false;
  } else {
    usingFallback = true;
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', machineKey(), iv);
    const enc = Buffer.concat([c.update(value, 'utf8'), c.final()]);
    const tag = c.getAuthTag();
    let all: Record<string, string> = {};
    try { all = JSON.parse(fs.readFileSync(fallbackPath(), 'utf8') as string) as Record<string, string>; } catch { /* noop */ }
    all[key] = Buffer.concat([iv, tag, enc]).toString('base64');
    fs.writeFileSync(fallbackPath(), JSON.stringify(all), { mode: 0o600 });
  }
}

export function loadSecret(key: string): string | undefined {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const p = path.join(xdgDir('config'), `secret-${key}.bin`);
      if (!fs.existsSync(p)) return undefined;
      return safeStorage.decryptString(fs.readFileSync(p));
    }
    usingFallback = true;
    const all = JSON.parse(fs.readFileSync(fallbackPath(), 'utf8') as string) as Record<string, string>;
    const raw = Buffer.from(all[key] ?? '', 'base64');
    if (!raw.length) return undefined;
    const d = crypto.createDecipheriv('aes-256-gcm', machineKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return undefined; }
}

export function clearSecrets(keys: string[]): void {
  for (const k of keys) {
    try { fs.unlinkSync(path.join(xdgDir('config'), `secret-${k}.bin`)); } catch { /* noop */ }
  }
  try {
    const all = JSON.parse(fs.readFileSync(fallbackPath(), 'utf8') as string) as Record<string, string>;
    for (const k of keys) delete all[k];
    fs.writeFileSync(fallbackPath(), JSON.stringify(all));
  } catch { /* noop */ }
  // NOTE: session cookies are cleared per-source by the auth-clear handler
  // (each source has its own partition), never the whole session at once.
}

/** Export cookies of one source session to netscape file for yt-dlp --cookies. */
export async function exportCookiesFile(source: string): Promise<string> {
  const { sessionFor } = await import('./login.js');
  const s = sessionFor(source);
  const cookies = await s.cookies.get({});
  const lines = ['# Netscape HTTP Cookie File'];
  for (const c of cookies) {
    lines.push([c.domain ?? '', 'TRUE', c.path ?? '/', String(c.secure).toUpperCase(), String(c.expirationDate ?? 0), c.name, c.value].join('\t'));
  }
  const p = path.join(xdgDir('cache'), `auth-cookies-${source}.txt`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.join('\n'), { mode: 0o600 });
  return p;
}

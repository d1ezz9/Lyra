import { createRequire } from 'node:module';

export function appVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = createRequire(process.cwd() + '/');
    const pkg = req('./package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch { return '0.0.0'; }
}

export function repositoryUrl(): string | undefined {
  try {
    const req = createRequire(process.cwd() + '/');
    const pkg = req('./package.json') as { repository?: string | { url?: string } };
    if (!pkg.repository) return undefined;
    return typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url;
  } catch { return undefined; }
}

export function userAgent(): string {
  const v = appVersion();
  const repo = repositoryUrl();
  return repo ? `Lyra/${v} (${repo})` : `Lyra/${v}`;
}

const NOISE = /\b(sped up|slowed|live|remix|cover|8d|nightcore|tiktok|reverb|bass boosted|extended|acoustic|karaoke|instrumental|demo)\b/i;

export function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/feat\.?.*$/i, ' ')
    .replace(/[^a-z0-9а-яё ]/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    const t = ` ${s} `;
    for (let i = 0; i < t.length - 1; i++) {
      const g = t.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = grams(a); const B = grams(b);
  let hit = 0;
  for (const [g, n] of A) hit += Math.min(n, B.get(g) ?? 0);
  return (2 * hit) / (a.length + b.length);
}

export interface MatchCandidate { title: string; artist: string; duration: number; }

/** Score 0..1 candidate vs wanted Spotify track. -1 rejects (explicit variant mismatch / preview). */
export function scoreMatch(
  wanted: { title: string; artist: string; duration: number },
  cand: MatchCandidate,
): number {
  const wt = wanted.title, wa = wanted.artist;
  const wantVariant = NOISE.test(wt);
  const candVariant = NOISE.test(`${cand.title} ${cand.artist}`);
  if (candVariant && !wantVariant) return -1; // exclude live/remix/cover unless original has it
  if (isPreview(cand.duration, wanted.duration)) return -1;
  const t = dice(normalize(wt), normalize(cand.title));
  const a = dice(normalize(wa), normalize(cand.artist));
  const dd = Math.abs(cand.duration - wanted.duration);
  const d = dd <= 3 ? 1 : dd <= 10 ? 0.5 : 0;
  return 0.6 * t + 0.3 * a + 0.1 * d;
}

/** Preview detection: fragment <60s while full track is longer, or <50% of expected. */
export function isPreview(actualDuration: number, expectedDuration?: number): boolean {
  if (expectedDuration && expectedDuration > 90 && actualDuration < 60) return true;
  if (expectedDuration && actualDuration < expectedDuration * 0.5) return true;
  return false;
}

export const MATCH_THRESHOLD = 0.55;

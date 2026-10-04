export interface LrcLine { time: number; text: string; }

/** Parse LRC (supports [mm:ss.xx] and multiple tags per line). */
export function parseLrc(input: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (tags.length === 0) continue;
    const text = raw.replace(/\[.*?\]/g, '').trim();
    for (const t of tags) {
      const m = Number(t[1]); const s = Number(t[2]);
      let frac = t[3] ?? '0';
      const fracSec = Number(frac) / Math.pow(10, frac.length);
      lines.push({ time: m * 60 + s + fracSec, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the active line for position `pos` (last line with time <= pos). */
export function activeLrcLine(lines: LrcLine[], pos: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].time <= pos) idx = i; else break;
  return idx;
}

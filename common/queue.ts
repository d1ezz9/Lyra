import type { Track } from './types.js';

export interface QueueState {
  items: Track[];
  index: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  order: number[]; // play order of indices into items
  cursor: number;  // position inside order
}

export function buildOrder(n: number, shuffle: boolean, rng: () => number = Math.random): number[] {
  const o = [...Array(n).keys()];
  if (shuffle) for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}

export function createQueue(items: Track[], shuffle = false): QueueState {
  return { items, index: 0, shuffle, repeat: 'off', order: buildOrder(items.length, shuffle), cursor: 0 };
}

export function currentTrack(q: QueueState): Track | undefined {
  const i = q.order[q.cursor];
  return i === undefined ? undefined : q.items[i];
}

/** Advance; returns new cursor or null when queue ends (repeat=off). Skips unavailable tracks. */
export function nextCursor(q: QueueState): number | null {
  for (let c = q.cursor + 1; c < q.order.length; c++) {
    const t = q.items[q.order[c]];
    if (!t?.unavailable) return c;
  }
  if (q.repeat === 'all') {
    for (let c = 0; c <= q.cursor; c++) {
      const t = q.items[q.order[c]];
      if (!t?.unavailable) return c;
    }
  }
  return null;
}

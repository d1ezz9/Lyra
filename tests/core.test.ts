import { describe, it, expect } from 'vitest';
import { parseLrc, activeLrcLine } from '../common/lrc';
import { scoreMatch, isPreview } from '../common/matcher';
import { detectSourceFromUrl } from '../common/detectSource';
import { createQueue, currentTrack, nextCursor } from '../common/queue';

describe('lrc', () => {
  it('parses tags and sorts', () => {
    const l = parseLrc('[00:05.00] b\n[00:01.00] a');
    expect(l.map((x) => x.text)).toEqual(['a', 'b']);
    expect(activeLrcLine(l, 3)).toBe(0);
  });
  it('multiple tags per line', () => {
    expect(parseLrc('[00:01.00][00:02.00] x')).toHaveLength(2);
  });
});

describe('matcher', () => {
  const want = { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 };
  it('scores exact high', () => {
    expect(scoreMatch(want, { title: 'Blinding Lights', artist: 'The Weeknd', duration: 201 })).toBeGreaterThan(0.55);
  });
  it('rejects live variant', () => {
    expect(scoreMatch(want, { title: 'Blinding Lights (Live)', artist: 'The Weeknd', duration: 200 })).toBe(-1);
  });
  it('fallback tolerant duration', () => {
    expect(scoreMatch(want, { title: 'Blinding Lights', artist: 'The Weeknd', duration: 208 })).toBeGreaterThan(0.4);
  });
  it('preview detection', () => {
    expect(isPreview(30, 200)).toBe(true);
    expect(isPreview(200, 200)).toBe(false);
  });
});

describe('detectSource', () => {
  it('soundcloud track vs set', () => {
    expect(detectSourceFromUrl('https://soundcloud.com/a/b').source).toBe('soundcloud');
    expect(detectSourceFromUrl('https://soundcloud.com/a/sets/x').kind).toBe('playlist');
  });
  it('spotify kinds', () => {
    expect(detectSourceFromUrl('https://open.spotify.com/playlist/1').kind).toBe('playlist');
    expect(detectSourceFromUrl('https://open.spotify.com/track/1').kind).toBe('track');
    expect(detectSourceFromUrl('https://open.spotify.com/episode/1').source).toBe('spotify');
  });
  it('ytmusic list', () => {
    expect(detectSourceFromUrl('https://music.youtube.com/watch?v=1&list=2').kind).toBe('playlist');
  });
});

describe('queue', () => {
  const t = (id: string, unavailable?: string) => ({ id, source: 'soundcloud' as const, title: id, artist: 'a', duration: 10, unavailable });
  it('skips unavailable', () => {
    const q = createQueue([t('1'), t('2', 'gone'), t('3')]);
    expect(currentTrack(q)?.id).toBe('1');
    expect(nextCursor(q)).toBe(2);
  });
  it('shuffle keeps all', () => {
    const q = createQueue([t('1'), t('2'), t('3')], true);
    expect([...q.order].sort()).toEqual([0, 1, 2]);
  });
});

describe('downloads/source switch', () => {
  it('dedup key by id or artist+title+duration', () => {
    const key = (x: { id: string; artist: string; title: string; duration: number }) =>
      x.id.startsWith('sc:') ? x.id : `${x.artist}|${x.title}|${Math.round(x.duration)}`;
    expect(key({ id: 'sc:1', artist: 'a', title: 'b', duration: 1 })).toBe('sc:1');
    expect(key({ id: 'x', artist: 'a', title: 'b', duration: 10.2 })).toBe('a|b|10');
  });
});

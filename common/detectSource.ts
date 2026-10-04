import type { SourceId } from './types.js';

export type LinkKind = 'track' | 'playlist' | 'album' | 'unknown';

/** Detect music source + entity kind from a pasted URL. */
export function detectSourceFromUrl(url: string): { source: SourceId | 'all'; kind: LinkKind } {
  const u = url.trim().toLowerCase();
  if (/soundcloud\.com/.test(u)) {
    if (/\/sets\//.test(u)) return { source: 'soundcloud', kind: 'playlist' };
    return { source: 'soundcloud', kind: 'track' };
  }
  if (/youtu\.be|youtube\.com|music\.youtube\.com/.test(u)) {
    if (/[?&]list=/.test(u)) return { source: 'youtubemusic', kind: 'playlist' };
    if (/\/playlist|\/album/.test(u)) return { source: 'youtubemusic', kind: 'album' };
    return { source: 'youtubemusic', kind: 'track' };
  }
  if (/open\.spotify\.com/.test(u)) {
    if (u.includes('/playlist/')) return { source: 'spotify', kind: 'playlist' };
    if (u.includes('/album/')) return { source: 'spotify', kind: 'album' };
    if (u.includes('/episode/')) return { source: 'spotify', kind: 'track' };
    return { source: 'spotify', kind: 'track' };
  }
  if (/\.(mp3|flac|ogg|opus|m4a|wav)(\?|$)/.test(u)) return { source: 'local', kind: 'track' };
  return { source: 'all', kind: 'unknown' };
}

export type SourceId = 'local' | 'soundcloud' | 'youtubemusic' | 'spotify';

export interface Track {
  id: string;
  source: SourceId;
  title: string;
  artist: string;
  album?: string;
  duration: number; // seconds
  coverUrl?: string;
  coverPath?: string;
  /** Прямая ссылка на страницу трека (для резолва потока через yt-dlp). */
  url?: string;
  lyricsRef?: string;
  localPath?: string;
  matchedFrom?: { source: SourceId; id: string };
  unavailable?: string;
  audioSource?: SourceId; // for spotify tracks: where sound comes from
}

export interface SearchResult { tracks: Track[]; playlists?: PlaylistRef[]; }
export interface PlaylistRef { id: string; source: SourceId; title: string; trackCount?: number; }

export interface MusicSource {
  id: SourceId;
  search(query: string, limit?: number): Promise<SearchResult>;
  resolve(urlOrId: string): Promise<Track | PlaylistRef | null>;
  getPlaylist(id: string): Promise<Track[]>;
  streamUrl(track: Track): Promise<string>;
}

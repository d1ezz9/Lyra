import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { xdgDir } from './paths.js';

let db: Database.Database | null = null;

export function openDb(): Database.Database {
  if (db) return db;
  const dir = xdgDir('data');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'lyra.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS tracks(
    id TEXT PRIMARY KEY, source TEXT, title TEXT, artist TEXT, album TEXT,
    duration REAL, coverUrl TEXT, coverPath TEXT, localPath TEXT, extra TEXT);
  CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(title, artist, album, content='tracks', content_rowid='rowid');
  CREATE TABLE IF NOT EXISTS lyrics_cache(track_id TEXT PRIMARY KEY, lrc TEXT, plain TEXT, updated INTEGER);
  CREATE TABLE IF NOT EXISTS spotify_match(spotify_id TEXT PRIMARY KEY, audio_source TEXT, audio_id TEXT, updated INTEGER);
  CREATE TABLE IF NOT EXISTS downloads(id TEXT PRIMARY KEY, url TEXT, title TEXT, status TEXT, progress REAL, dest TEXT);`);
  return db;
}

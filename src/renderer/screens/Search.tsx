import React, { useState } from 'react';
import { useStore } from '../store';
import { detectSourceFromUrl } from '@common/detectSource';
import type { Track } from '@common/types';
import { playTrack, playSingle } from '../player';
import { TrackMenu } from '../components/TrackMenu';
import { fmtDur } from '../format';
import { I } from '../icons';

const badgeClass: Record<string, string> = { soundcloud: '', youtubemusic: '', spotify: '', local: '' };

interface Pl { id: string; title: string; artist: string; trackCount?: number; coverUrl?: string; playlistId?: number; url?: string; }

export function Search(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'tracks' | 'playlists'>('tracks');
  const [results, setResults] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Pl[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = async (): Promise<void> => {
    if (!q.trim()) return;
    const det = detectSourceFromUrl(q);
    if (det.source !== 'all' && (det.source as string) !== s.source) {
      s.setSource(det.source as never);
      s.snack(`${t('searchDetected')}: ${det.source} (${det.kind})`);
    }
    const src = det.source === 'all' ? useStore.getState().source : (det.source as never);
    // pasted playlist/album link always opens as playlist
    if (det.kind === 'playlist' || det.kind === 'album') {
      await openPlaylist(src as string, { url: q.trim() });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'playlists') {
        if (src !== 'soundcloud') { s.snack(t('plOnlySc')); setPlaylists([]); }
        else setPlaylists((await window.lyra.searchPlaylists(q, src)) as Pl[]);
        setResults([]);
      } else {
        const list = src === 'spotify'
          ? (await window.lyra.spotifySearch(q)) as Track[]
          : src === 'local'
            ? [] : (await window.lyra.search(q, src)) as Track[];
        setResults(list);
        setPlaylists([]);
      }
    } catch (e) {
      const msg = String(e);
      s.snack(msg.includes('need-setup') ? t('searchNeedId') : t('searchErr'));
      setResults([]);
      setPlaylists([]);
    }
    setBusy(false);
    setSearched(true);
  };

  const play = (tr: Track): void => {
    void playSingle({ ...tr });
  };

  const openPlaylist = async (src: string, ref: { url?: string; playlistId?: number; id?: string }): Promise<void> => {
    setBusy(true);
    try {
      const pid = ref.playlistId ?? (ref.id?.includes('playlist:') ? Number(ref.id.split('playlist:')[1]) : undefined);
      const tracks = (await window.lyra.playlistTracks(src, { url: ref.url, playlistId: pid })) as Track[];
      if (!tracks.length) { s.snack(t('searchNoRes')); return; }
      const { openPlaylistWithLocal } = await import('../playlists');
      await openPlaylistWithLocal(ref.id ?? ref.url ?? q, src, q, tracks);
      s.snack(`${tracks.length} ${t('plQueued')}`);
    } catch { s.snack(t('searchErr')); }
    setBusy(false);
  };

  const downloadAll = async (pl: Pl): Promise<void> => {
    setBusy(true);
    try {
      const pid = pl.playlistId ?? (pl.id.includes('playlist:') ? Number(pl.id.split('playlist:')[1]) : undefined);
      const tracks = (await window.lyra.playlistTracks(s.source, { url: pl.url, playlistId: pid })) as Track[];
      if (!tracks.length) { s.snack(t('searchNoRes')); return; }
      const { downloadPlaylist } = await import('../playlists');
      await downloadPlaylist(pl.id, tracks, (p) => {
        if (p.done + p.skipped >= p.total) s.snack(`${t('dlAllDone')} · ${p.skipped} ${t('dlSkipped')}`);
      });
      s.snack(t('dlStarted'));
    } catch { s.snack(t('searchErr')); }
    setBusy(false);
  };

  return (
    <section>
      <h1 className="headline-s section-title">{t('searchTitle')}</h1>
      <div className="searchbar" style={{ maxWidth: '100%' }}>
        <I.search />
        <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)}
          onPaste={() => setTimeout(() => { void run(); }, 0)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }} placeholder={t('searchPh')} />
        <button className="m3 m3-filled" style={{ height: 36 }} disabled={busy || !q} onClick={() => void run()}>
          {busy ? t('searchWait') : t('searchGo')}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '12px 8px' }}>
        <button className={'chip' + (mode === 'tracks' ? ' active' : '')} onClick={() => setMode('tracks')}>
          {mode === 'tracks' && <I.check size={18} />}{t('searchTracks')}
        </button>
        <button className={'chip' + (mode === 'playlists' ? ' active' : '')} onClick={() => setMode('playlists')}>
          {mode === 'playlists' && <I.check size={18} />}{t('searchPlaylists')}
        </button>
        <span className={`badge ${badgeClass[s.source] ?? ''}`} style={{ alignSelf: 'center' }}>{s.source}</span>
      </div>
      {searched && results.length === 0 && playlists.length === 0 && !busy && (
        <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '0 8px' }}>{t('searchNoRes')}</p>
      )}
      {results.map((tr, i) => (
        <div key={tr.id + i} className="list-item" role="button" tabIndex={0}
          onClick={() => void play(tr)}
          onKeyDown={(e) => { if (e.key === 'Enter') void play(tr); }}>
          <span className="leading">{tr.coverUrl
            ? <img src={tr.coverUrl} alt="" />
            : <I.music />}</span>
          <span className="texts">
            <span className="t1">{tr.title}</span>
            <span className="t2">{tr.artist}{tr.duration ? ` · ${fmtDur(tr.duration)}` : ''}</span>
          </span>
          <span className="trail">
            <span className="badge">{tr.source}</span>
            <TrackMenu track={tr} />
          </span>
        </div>
      ))}
      {playlists.map((pl) => (
        <div key={pl.id} className="list-item" role="button" tabIndex={0}
          onClick={() => void openPlaylist(s.source, pl)}>
          <span className="leading">{pl.coverUrl ? <img src={pl.coverUrl} alt="" /> : <I.playlists />}</span>
          <span className="texts">
            <span className="t1">{pl.title}</span>
            <span className="t2">{pl.artist}{pl.trackCount ? ` · ${pl.trackCount} ${t('libTracks')}` : ''}</span>
          </span>
          <span className="trail">
            <span className="badge">{s.source}</span>
            <button className="icon-btn" aria-label={t('dlAll')} title={t('dlAll')}
              onClick={(e) => { e.stopPropagation(); void downloadAll(pl); }}><I.download /></button>
          </span>
        </div>
      ))}
    </section>
  );
}

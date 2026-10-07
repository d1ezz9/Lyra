import React, { useState } from 'react';
import { useStore } from '../store';
import type { Track } from '@common/types';
import { playIndex } from '../player';
import { TrackMenu } from '../components/TrackMenu';
import { fmtDur } from '../format';
import { I } from '../icons';
import { P } from '../icons';

function BackIcon(): React.ReactElement {
  return (<svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>);
}

export function Playlist(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const pl = s.currentPlaylist;
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const isMine = !!pl?.id?.startsWith('user:');

  const playOne = (tr: Track): void => {
    const st = useStore.getState();
    const qi = st.queue.findIndex((x) => x.id === tr.id);
    if (qi >= 0) void playIndex(qi);
    else {
      st.enqueue([tr]);
      void playIndex(useStore.getState().queue.length - 1);
    }
  };

  const playAll = (): void => {
    playList(false);
  };

  const shuffleAll = (): void => {
    playList(true);
  };

  const playList = (shuffle: boolean): void => {
    if (!pl || !pl.tracks.length) return;
    const st = useStore.getState();
    const have = new Set(st.queue.map((x) => x.id));
    const fresh = pl.tracks.filter((x) => !have.has(x.id));
    let list = fresh;
    if (shuffle && fresh.length > 1) {
      list = [...fresh];
      for (let k = list.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [list[k], list[j]] = [list[j], list[k]];
      }
    }
    if (list.length) st.enqueue(list);
    const firstId = (shuffle ? list[0] : pl.tracks[0])?.id;
    const qi = useStore.getState().queue.findIndex((x) => x.id === firstId);
    if (qi >= 0) void playIndex(qi);
  };

  const downloadAll = async (): Promise<void> => {
    if (!pl || !pl.tracks.length) return;
    const { downloadPlaylist } = await import('../playlists');
    s.snack(t('dlStarted'));
    await downloadPlaylist(pl.title, pl.tracks, (p) => {
      if (p.done + p.skipped >= p.total) s.snack(`${t('dlAllDone')} · ${p.skipped} ${t('dlSkipped')}`);
    });
  };

  if (!pl) {
    return (
      <section>
        <h1 className="headline-s section-title">{t('navPlaylists')}</h1>
        <p className="body-m" style={{ margin: '0 8px' }}>{t('searchNoRes')}</p>
      </section>
    );
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 8px' }}>
        <button className="icon-btn" aria-label="Back" onClick={() => s.setScreen('playlists')}><BackIcon /></button>
        <h1 className="headline-s" style={{ margin: 0 }}>{pl.title}</h1>
      </div>
      <div style={{ margin: '0 8px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="m3 m3-filled" onClick={playAll}><P.play size={20} /> {t('plPlayAll')}</button>
        <button className="m3 m3-tonal" onClick={shuffleAll}><I.shuffle size={20} /> {t('shufflePlay')}</button>
        <button className="m3 m3-tonal" onClick={() => void downloadAll()}><I.download size={20} /> {t('dlAll')}</button>
        {isMine && (
          <>
            <button className="m3 m3-outline" onClick={() => { setNewTitle(pl.title); setRenaming((v: boolean) => !v); }}>{t('myPlRename')}</button>
            <button className="m3 m3-outline" onClick={() => { s.deletePlaylist(pl.id as string); s.setScreen('playlists'); }}>{t('myPlDelete')}</button>
          </>
        )}
      </div>
      {isMine && renaming && (
        <div style={{ margin: '0 8px 12px', display: 'flex', gap: 8 }}>
          <input className="m3-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ flex: 1 }} />
          <button className="m3 m3-filled" style={{ height: 40 }} disabled={!newTitle.trim()}
            onClick={() => { s.renamePlaylist(pl.id as string, newTitle.trim()); setRenaming(false); }}>OK</button>
        </div>
      )}
      <p className="body-s" style={{ color: 'var(--on-surface-variant)', margin: '0 8px 8px' }}>
        {pl.tracks.length} {t('libTracks')}
      </p>
      {pl.tracks.map((tr, i) => (
        <div key={tr.id + i} className="list-item" role="button" tabIndex={0} onClick={() => playOne(tr)}>
          <span className="leading">{tr.coverUrl ? <img src={tr.coverUrl} alt="" /> : <I.music />}</span>
          <span className="texts">
            <span className="t1">{tr.title}</span>
            <span className="t2">{tr.artist}{tr.duration ? ` · ${fmtDur(tr.duration)}` : ''}</span>
          </span>
          <span className="trail">
            <span className="badge">{tr.source}</span>
            {tr.localPath && <span className="badge">{t('srcLocal')}</span>}
            {isMine ? (
              <button className="icon-btn" aria-label={t('myPlRemove')} title={t('myPlRemove')}
                onClick={(e) => { e.stopPropagation(); s.removeFromPlaylist(pl.id as string, tr.id); }}>
                <I.close size={20} />
              </button>
            ) : (
              <TrackMenu track={tr} />
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

import React, { useState } from 'react';
import type { Track } from '@common/types';
import { useStore } from '../store';
import { downloadTrack, playIndex } from '../player';
import { I } from '../icons';
import { fmtDur } from '../format';

/** Per-track "⋯" menu (M3 menu): queue, download, other versions (+ candidates dialog). */
export function TrackMenu({ track, onUse }: { track: Track; onUse?: (c: Track) => void }): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState<Track[]>([]);
  const [candBusy, setCandBusy] = useState(false);
  const [candOpen, setCandOpen] = useState(false);
  const [plOpen, setPlOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const liked = s.isLiked(track.id);
  const disliked = s.dislikes.includes(track.id);

  const download = (): void => {
    setOpen(false);
    void downloadTrack(track);
  };

  const openVersions = async (): Promise<void> => {
    setOpen(false);
    if (track.source === 'local' && !track.url) { s.snack(t('qVersionsSoon')); return; }
    setCandOpen(true);
    setCands([]);
    setCandBusy(true);
    const out: Track[] = [];
    for (const src of ['soundcloud', 'youtubemusic'] as const) {
      try {
        const list = (await window.lyra.search(`${track.title} ${track.artist}`, src)) as Track[];
        out.push(...list.slice(0, 5));
      } catch { /* skip source */ }
    }
    setCands(out);
    setCandBusy(false);
  };

  const useCandidate = (c: Track): void => {
    setCandOpen(false);
    if (onUse) { onUse(c); return; }
    const st = useStore.getState();
    st.enqueue([{ ...c }]);
    void playIndex(useStore.getState().queue.length - 1);
  };

  return (
    <span style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label="More" title="More"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}><I.more /></button>
      {open && (
        <>
          <div className="menu-scrim" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="menu" role="menu" style={{ left: 'auto', right: 0, minWidth: 220 }}>
            <button className="menu-item" onClick={(e) => { e.stopPropagation(); s.enqueue([track]); setOpen(false); }}>
              <span className="body-l">{t('tmQueue')}</span>
            </button>
            <button className="menu-item" onClick={(e) => { e.stopPropagation(); download(); }}>
              <span className="body-l">{t('tmDownload')}</span>
            </button>
            <button className="menu-item" onClick={(e) => { e.stopPropagation(); s.toggleLike(track); }}>
              <span className="body-l">{liked ? t('tmUnlike') : t('tmLike')}</span>
            </button>
            <button className="menu-item" onClick={(e) => { e.stopPropagation(); s.toggleDislike(track.id); }}>
              <span className="body-l">{disliked ? t('tmUndislike') : t('tmDislike')}</span>
            </button>
            <button className="menu-item" onClick={(e) => { e.stopPropagation(); setPlOpen((v) => !v); }}>
              <span className="body-l">{t('tmAddToPl')}</span>
            </button>
            {plOpen && (
              <>
                {s.myplaylists.map((p) => (
                  <button key={p.id} className="menu-item" style={{ paddingLeft: 32 }}
                    onClick={(e) => { e.stopPropagation(); s.addToPlaylist(p.id, track); setOpen(false); setPlOpen(false); }}>
                    <span className="body-l">{p.title}</span>
                  </button>
                ))}
                <button className="menu-item" style={{ paddingLeft: 32 }}
                  onClick={(e) => { e.stopPropagation(); setNewOpen(true); }}>
                  <span className="body-l">+ {t('tmNewPl')}</span>
                </button>
              </>
            )}
            <button className="menu-item" onClick={(e) => { e.stopPropagation(); void openVersions(); }}>
              <span className="body-l">{t('qPickOther')}</span>
            </button>
          </div>
        </>
      )}
      {newOpen && (
        <div className="scrim" onClick={() => setNewOpen(false)}>
          <div className="dialog" role="dialog" aria-label={t('myPlTitle')} onClick={(e) => e.stopPropagation()}>
            <h2>{t('myPlTitle')}</h2>
            <input className="m3-input" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder={t('myPlName')} style={{ width: '100%' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  s.addToPlaylist(s.createPlaylist(newName.trim()), track);
                  setNewOpen(false); setOpen(false); setNewName('');
                }
              }} />
            <div className="actions">
              <button className="m3 m3-filled" disabled={!newName.trim()}
                onClick={() => { s.addToPlaylist(s.createPlaylist(newName.trim()), track); setNewOpen(false); setOpen(false); setNewName(''); }}>
                {t('myPlCreate')}
              </button>
            </div>
          </div>
        </div>
      )}
      {candOpen && (
        <div className="scrim" onClick={() => setCandOpen(false)}>
          <div className="dialog" role="dialog" aria-label={t('qVersions')} onClick={(e) => e.stopPropagation()}>
            <h2>{t('qVersions')}</h2>
            {candBusy && <p className="body-m">{t('searchWait')}</p>}
            {!candBusy && cands.length === 0 && <p className="body-m">{t('searchNoRes')}</p>}
            {cands.map((c, i) => (
              <div key={c.id + i} className="list-item" role="button" tabIndex={0} onClick={() => useCandidate(c)}>
                <span className="leading"><I.music /></span>
                <span className="texts">
                  <span className="t1">{c.title}</span>
                  <span className="t2">{c.artist}{c.duration ? ` · ${fmtDur(c.duration)}` : ''}</span>
                </span>
                <span className="trail">
                  <span className="badge">{c.source}</span>
                  <button className="m3 m3-tonal" style={{ height: 32 }}>{t('qUse')}</button>
                </span>
              </div>
            ))}
            <div className="actions">
              <button className="m3 m3-text" onClick={() => setCandOpen(false)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

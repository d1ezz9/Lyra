import React, { useState } from 'react';
import { useStore } from '../store';
import type { Track } from '@common/types';
import { playIndex } from '../player';
import { I } from '../icons';

export function Queue(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [candFor, setCandFor] = useState<number | null>(null);
  const [cands, setCands] = useState<Track[]>([]);
  const [candBusy, setCandBusy] = useState(false);

  const play = (i: number): void => { void playIndex(i); };

  const openCandidates = async (i: number): Promise<void> => {
    const tr = useStore.getState().queue[i];
    if (!tr || tr.source === 'local') { s.snack(t('qVersionsSoon')); return; }
    setCandFor(i);
    setCands([]);
    setCandBusy(true);
    const out: Track[] = [];
    for (const src of ['soundcloud', 'youtubemusic'] as const) {
      try {
        const list = (await window.lyra.search(`${tr.title} ${tr.artist}`, src)) as Track[];
        out.push(...list.slice(0, 5));
      } catch { /* skip source */ }
    }
    setCands(out);
    setCandBusy(false);
  };

  const useCandidate = async (c: Track): Promise<void> => {
    if (candFor === null) return;
    const i = candFor;
    useStore.setState((st) => ({
      queue: st.queue.map((x, xi) => (xi === i
        ? { ...x, url: c.url, coverUrl: c.coverUrl ?? x.coverUrl, duration: c.duration || x.duration, unavailable: undefined, audioSource: c.source as Track['audioSource'] }
        : x)),
    }));
    setCandFor(null);
    play(i);
  };

  return (
    <section>
      <h1 className="headline-s section-title">{t('qTitle')}</h1>
      <div style={{ margin: '0 8px 12px' }}>
        <button className="m3 m3-tonal" onClick={() => s.clear()}><I.close size={18} /> {t('qClear')}</button>
      </div>
      {s.queue.length === 0 && (
        <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '0 8px' }}>{t('qEmpty')}</p>
      )}
      {s.queue.map((tr, i) => (
        <div key={tr.id + i} className={'list-item' + (i === s.index ? ' current' : '') + (tr.unavailable ? ' dim' : '')}
          role="button" tabIndex={0} onClick={() => void play(i)}>
          <span className="leading">{tr.coverUrl ? <img src={tr.coverUrl} alt="" /> : <I.music />}</span>
          <span className="texts">
            <span className="t1">{tr.title}</span>
            <span className="t2">{tr.unavailable ?? tr.artist}</span>
          </span>
          <span className="trail">
            <span className="badge">{tr.source}</span>
            {tr.audioSource && <span className="badge">звук с {tr.audioSource}</span>}
            <button className="icon-btn" aria-label={t('qPickOther')} title={t('qPickOther')}
              onClick={(e) => { e.stopPropagation(); void openCandidates(i); }}><I.more /></button>
          </span>
        </div>
      ))}
      {candFor !== null && (
        <div className="scrim" onClick={() => setCandFor(null)}>
          <div className="dialog" role="dialog" aria-label={t('qVersions')} onClick={(e) => e.stopPropagation()}>
            <h2>{t('qVersions')}</h2>
            {candBusy && <p className="body-m">{t('searchWait')}</p>}
            {!candBusy && cands.length === 0 && <p className="body-m">{t('searchNoRes')}</p>}
            {cands.map((c, i) => (
              <div key={c.id + i} className="list-item" role="button" tabIndex={0} onClick={() => void useCandidate(c)}>
                <span className="leading"><I.music /></span>
                <span className="texts">
                  <span className="t1">{c.title}</span>
                  <span className="t2">{c.artist}{c.duration ? ` · ${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, '0')}` : ''}</span>
                </span>
                <span className="trail">
                  <span className={`badge ${c.source === 'soundcloud' ? 'sc' : 'yt'}`}>{c.source}</span>
                  <button className="m3 m3-tonal" style={{ height: 32 }}>{t('qUse')}</button>
                </span>
              </div>
            ))}
            <div className="actions">
              <button className="m3 m3-text" onClick={() => setCandFor(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

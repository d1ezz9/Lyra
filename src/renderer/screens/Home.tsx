import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Track } from '@common/types';
import { playTrack } from '../player';
import { I } from '../icons';
import { P } from '../icons';

export function Home(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [charts, setCharts] = useState<Track[]>([]);

  useEffect(() => {
    void (window.lyra.scCharts() as Promise<Track[]>).then(setCharts).catch(() => setCharts([]));
  }, []);

  const resume = async (): Promise<void> => {
    const st = useStore.getState();
    if (!st.queue.length) return;
    st.setScreen('queue');
    await playTrack(st.queue[st.index] ?? st.queue[0]);
  };

  const playChart = async (tr: Track): Promise<void> => {
    const st = useStore.getState();
    st.enqueue([tr]);
    st.setIndex(useStore.getState().queue.length - 1);
    await playTrack(tr);
  };

  const cur = s.queue[s.index];
  return (
    <section>
      <h1 className="headline-s section-title">Lyra</h1>
      <div className="grid">
        {s.widgets.cont && s.queue.length > 0 && (
          <div className="card elevated" style={{ cursor: 'default', gridColumn: '1 / -1' }}>
            <div className="title-m">{t('hmContinue')}</div>
            <div className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '4px 0 12px' }}>
              {cur ? `${cur.artist} — ${cur.title}` : ''}
            </div>
            <button className="m3 m3-filled" onClick={() => void resume()}>
              <P.play size={20} /> {t('hmResume')}
            </button>
          </div>
        )}
        {s.widgets.shortcuts && (
        <div className="card" style={{ cursor: 'default' }}>
          <div className="title-m">{t('hmShortcuts')}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="m3 m3-tonal" onClick={() => s.setScreen('search')}><I.search size={20} /> {t('navSearch')}</button>
            <button className="m3 m3-tonal" onClick={() => s.setScreen('downloads')}><I.download size={20} /> {t('navDownloads')}</button>
            <button className="m3 m3-tonal" onClick={() => s.setScreen('settings')}><I.settings size={20} /> {t('navSettings')}</button>
          </div>
        </div>
        )}
      </div>
      {s.widgets.charts && charts.length > 0 && (
        <>
          <h2 className="title-m section-title">{t('hmCharts')}</h2>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 8px 12px' }}>
            {charts.map((tr) => (
              <button key={tr.id} className="card elevated" style={{ minWidth: 168, maxWidth: 168 }}
                onClick={() => void playChart(tr)}>
                <div className="cover" style={{ height: 140 }}>
                  {tr.coverUrl ? <img src={tr.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : <I.music size={40} />}
                </div>
                <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.title}</div>
                <div className="body-s" style={{ color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.artist}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

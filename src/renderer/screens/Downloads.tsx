import React, { useEffect, useState } from 'react';
import { LinearProgress } from '../components/Progress';
import { DropDown } from '../components/DropDown';
import { I } from '../icons';
import { useStore } from '../store';

interface Job { id: string; url: string; title: string; status: 'active' | 'paused' | 'done' | 'error'; progress: number; }

export function Downloads(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('opus');
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const sub = window.lyra.onDownloadProgress as unknown as
      (cb: (m: { id: string; status: string; progress?: number }) => void) => void;
    sub?.((m) => {
      // ignore foreign jobs (e.g. background cache downloads)
      let known = false;
      setJobs((js) => {
        known = js.some((j) => j.id === m.id);
        return js.map((j) => (j.id === m.id
          ? { ...j, status: m.status === 'done' ? 'done' : m.status === 'error' ? 'error' : 'active', progress: m.progress ?? j.progress }
          : j));
      });
      if (!known) return;
      if (m.status === 'done') useStore.getState().snack(useStore.getState().t('dlFinished'));
      if (m.status === 'error') useStore.getState().snack(useStore.getState().t('dlFailed'));
    });
  }, []);

  const start = async (): Promise<void> => {
    if (!url.trim()) return;
    const id = (await window.lyra.downloadStart(url.trim(), format)) as string;
    setJobs((js) => [{ id, url: url.trim(), title: url.trim(), status: 'active', progress: 0 }, ...js]);
    s.snack(t('dlStarted'));
    setUrl('');
  };

  const statusText = (j: Job): string =>
    j.status === 'done' ? t('dlDone') : j.status === 'error' ? t('dlError')
      : j.status === 'paused' ? t('dlPaused') : `${t('dlActive')} · ${Math.round(j.progress)}%`;

  return (
    <section>
      <h1 className="headline-s section-title">{t('dlTitle')}</h1>
      <div className="searchbar" style={{ maxWidth: '100%' }}>
        <I.download />
        <input aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void start(); }} placeholder={t('dlUrlPh')} />
        <DropDown label={t('dlFormat')} value={format}
          options={['opus', 'mp3', 'm4a', 'flac'].map((f) => ({ v: f, label: f }))}
          onPick={setFormat} />
        <button className="m3 m3-filled" style={{ height: 36 }} disabled={!url.trim()} onClick={() => void start()}>
          {t('dlStart')}
        </button>
      </div>
      <div style={{ marginTop: 16 }}>
        {jobs.map((j) => (
          <div key={j.id} className="list-item" style={{ cursor: 'default' }}>
            <span className="leading"><I.music /></span>
            <span className="texts">
              <span className="t1">{j.title}</span>
              <span className="t2">{statusText(j)}</span>
              {j.status === 'active' && (
                <span style={{ display: 'block', marginTop: 8 }}>
                  <LinearProgress value={j.progress} label={j.title} />
                </span>
              )}
            </span>
            <span className="trail">
              {j.status === 'error' && (
                <button className="icon-btn" aria-label={t('dlRetry')} onClick={() => void window.lyra.downloadStart(j.url, format)}><I.refresh /></button>
              )}
              {j.status !== 'done' && (
                <button className="icon-btn" aria-label={t('dlCancel')}
                  onClick={() => { void window.lyra.downloadCancel(j.id); setJobs((js) => js.filter((x) => x.id !== j.id)); }}>
                  <I.close />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

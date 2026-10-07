import React, { useEffect, useState } from 'react';
import { parseLrc, activeLrcLine } from '@common/lrc';
import { useStore } from '../store';
import { Slider } from '../components/Progress';
import { I } from '../icons';
import { P } from '../icons';
import { advance, playIndex } from '../player';

export function NowPlaying(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const { current, playing } = s;
  const [lrcText, setLrcText] = useState<string | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [follow, setFollow] = useState(true);

  // live position from mpv
  useEffect(() => {
    (window.lyra.onMpv as unknown as ((cb: (m: { name: string; value: unknown }) => void) => void) | undefined)?.((m) => {
      if (m.name === 'time-pos' && typeof m.value === 'number') setPos(m.value);
    });
  }, []);

  // real lyrics chain: sidecar .lrc -> embedded tags (via local scan: no) -> LRCLIB -> plain
  useEffect(() => {
    setLrcText(null);
    setPlain(null);
    setFollow(true);
    if (!current) return;
    let alive = true;
    void (async () => {
      if (current.localPath) {
        try {
          const side = (await window.lyra.sidecarLyrics(current.localPath)) as string | null;
          if (side && alive && parseLrc(side).length) { setLrcText(side); return; }
        } catch { /* fall through */ }
      }
      try {
        const r = (await window.lyra.lyrics(current.title, current.artist)) as {
          syncedLyrics?: string; plainLyrics?: string;
        } | null;
        if (!alive || !r) return;
        if (r.syncedLyrics && parseLrc(r.syncedLyrics).length) setLrcText(r.syncedLyrics);
        else if (r.plainLyrics) setPlain(r.plainLyrics);
      } catch { /* offline etc. */ }
    })();
    return () => { alive = false; };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = lrcText ? parseLrc(lrcText) : [];
  const active = follow ? activeLrcLine(lines, pos) : -1;
  // only 3 lines visible: previous, active, next — always fits, active centered
  const win3 = active >= 0
    ? lines.slice(Math.max(0, active - 1), Math.min(lines.length, active + 2))
    : [];
  const winBase = active >= 0 ? Math.max(0, active - 1) : 0;
  const upNext = s.queue.slice(s.index + 1, s.index + 6);
  const lineRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // keep the active line centered: smooth auto-scroll while following
  useEffect(() => {
    if (follow && active >= 0) {
      lineRefs.current[active]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [active, follow]);

  return (
    <section className="np-page">
      <div className="np-top">
        <h1 className="headline-s" style={{ margin: 0, flex: 1 }}>{t('npTitle')}</h1>
        <button className="icon-btn" aria-label="Close" onClick={() => s.setScreen('home')}><I.close /></button>
      </div>
      <div className="np">
        <div className="art">
          {current?.coverUrl
            ? <img src={current.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }} />
            : <I.music size={120} />}
        </div>
        <div className="side">
          <div className="np-fixed">
          <div className="display-s">{current?.title ?? t('npNone')}</div>
          <div className="title-l" style={{ color: 'var(--on-surface-variant)' }}>{current?.artist ?? '—'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            {current && <span className="badge">{current.source}</span>}
            {current?.audioSource && <span className="badge">{t('soundFrom').replace('{src}', current.audioSource)}</span>}
          </div>
          <Slider value={pos} max={current?.duration || 200} label="Position"
            onScrub={(v) => { setPos(v); setFollow(true); void window.lyra.control('seek', v); }} />
          <div className="controls">
            <button className="icon-btn" aria-label="Previous" onClick={() => void advance(-1)}><P.prev /></button>
            <button className="icon-btn filled" aria-label="Play/Pause" onClick={() => void window.lyra.control('toggle')}>
              {playing ? <P.pause /> : <P.play />}
            </button>
            <button className="icon-btn" aria-label="Next" onClick={() => void advance(1)}><P.next /></button>
            {!follow && <button className="m3 m3-tonal" onClick={() => setFollow(true)}>{t('npBack')}</button>}
          </div>
          </div>
          <div className="np-scroll">
          {lines.length > 0 ? (
            <div className="lrc lrc-flat lrc-3" onWheel={() => setFollow(false)}>
              {(follow && active >= 0 ? win3 : lines).map((l, k) => {
                const i = follow && active >= 0 ? winBase + k : k;
                return (
                  <button key={i} ref={(el) => { lineRefs.current[i] = el; }}
                    className={'lrc-line' + (i === active ? ' on' : '')}
                    onClick={() => { setFollow(true); void window.lyra.control('seek', l.time); }}>{l.text || <I.music size={20} />}</button>
                );
              })}
            </div>
          ) : plain ? (
            <div className="lrc lrc-flat"><div className="lrc-line" style={{ cursor: 'default' }}>{plain}</div></div>
          ) : (
            <p className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{t('npNoLyrics')}</p>
          )}
          {upNext.length > 0 && (
            <div className="up-next">
              <div className="label-m" style={{ color: 'var(--on-surface-variant)', margin: '12px 8px 4px' }}>{t('upNext')}</div>
              {upNext.map((tr, k) => (
                <div key={tr.id + k} className="list-item" role="button" tabIndex={0} onClick={() => void playIndex(s.index + 1 + k)}>
                  <span className="leading">{tr.coverUrl ? <img src={tr.coverUrl} alt="" /> : <I.music />}</span>
                  <span className="texts">
                    <span className="t1">{tr.title}</span>
                    <span className="t2">{tr.artist}</span>
                  </span>
                  <span className="trail"><span className="badge">{tr.source}</span></span>
                </div>
              ))}
            </div>
          )}
          <details style={{ marginTop: 12 }}>
            <summary className="label-l" style={{ cursor: 'pointer' }}>{t('npEditLrc')}</summary>
            <textarea className="m3-text" value={lrcText ?? ''} onChange={(e) => setLrcText(e.target.value)} rows={6} cols={50} style={{ width: '100%', marginTop: 8 }} />
          </details>
          </div>
        </div>
      </div>
    </section>
  );
}

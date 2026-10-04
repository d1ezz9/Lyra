import React, { useEffect, useState } from 'react';
import { parseLrc, activeLrcLine } from '@common/lrc';
import { useStore } from '../store';
import { Slider } from '../components/Progress';
import { I } from '../icons';
import { P } from '../icons';
import { advance } from '../player';

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
  const lineRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // keep the active line centered: smooth auto-scroll while following
  useEffect(() => {
    if (follow && active >= 0) {
      lineRefs.current[active]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [active, follow]);

  return (
    <section className="np-page">
      <h1 className="headline-s section-title">{t('npTitle')}</h1>
      <div className="np">
        <div className="art">
          {current?.coverUrl
            ? <img src={current.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }} />
            : <I.music size={120} />}
        </div>
        <div className="side">
          <div className="display-s">{current?.title ?? t('npNone')}</div>
          <div className="title-l" style={{ color: 'var(--on-surface-variant)' }}>{current?.artist ?? '—'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            {current && <span className="badge">{current.source}</span>}
            {current?.audioSource && <span className="badge">звук с {current.audioSource}</span>}
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
          {lines.length > 0 ? (
            <div className="lrc" onWheel={() => setFollow(false)}>
              {lines.map((l, i) => (
                <button key={i} ref={(el) => { lineRefs.current[i] = el; }}
                  className={'lrc-line' + (i === active ? ' on' : '')}
                  onClick={() => { setFollow(true); void window.lyra.control('seek', l.time); }}>{l.text || <I.music size={20} />}</button>
              ))}
            </div>
          ) : plain ? (
            <div className="lrc"><div className="lrc-line" style={{ cursor: 'default' }}>{plain}</div></div>
          ) : (
            <p className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{t('npNoLyrics')}</p>
          )}
          <details style={{ marginTop: 12 }}>
            <summary className="label-l" style={{ cursor: 'pointer' }}>{t('npEditLrc')}</summary>
            <textarea className="m3-text" value={lrcText ?? ''} onChange={(e) => setLrcText(e.target.value)} rows={6} cols={50} style={{ width: '100%', marginTop: 8 }} />
          </details>
        </div>
      </div>
    </section>
  );
}

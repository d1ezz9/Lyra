import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { applyTheme } from './themes';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';
import { Library } from './screens/Library';
import { Home } from './screens/Home';
import { NowPlaying } from './screens/NowPlaying';
import { Slider, LinearProgress } from './components/Progress';
import { I } from './icons';
import { P } from './icons';
import { LogoIcon } from './icons';
import { advance, pickSource as pickSourceGo } from './player';
import { Playlist } from './screens/Playlist';
import type { SourceId } from '@common/types';
import type { Key } from './i18n';

declare global { interface Window { lyra: Record<string, any>; } }

const NAV: { id: 'home' | 'search' | 'playlists' | 'settings'; label: Key; icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'home', label: 'navHome', icon: I.home },
  { id: 'search', label: 'navSearch', icon: I.search },
  { id: 'playlists', label: 'navPlaylists', icon: I.playlists },
  { id: 'settings', label: 'navSettings', icon: I.settings },
];

const SOURCES: { id: SourceId; label: Key }[] = [
  { id: 'local', label: 'srcLocal' },
  { id: 'soundcloud', label: 'srcSC' },
  { id: 'youtubemusic', label: 'srcYTM' },
  { id: 'spotify', label: 'srcSP' },
];

export { SOURCES };

const ORDER: SourceId[] = ['local', 'soundcloud', 'youtubemusic', 'spotify'];

function fmt(sec: number): string {
  const m = Math.floor(sec / 60); const s2 = Math.floor(sec % 60);
  return `${m}:${String(s2).padStart(2, '0')}`;
}

export function App(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [noShowAgain, setNoShowAgain] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [railOpen, setRailOpen] = useState(localStorage.getItem('lyra:rail') === 'open');
  useEffect(() => {
    const sysLight = matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(s.followSystem && sysLight ? 'material-light' : s.theme);
  }, [s.theme, s.followSystem]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        pickSource(ORDER[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.source, s.spotifyAcknowledged]);
  useEffect(() => {
    const api = window.lyra;
    if (!api?.onMpv) return;
    api.onMpv((m: { name: string; value: unknown }) => {
      if (m.name === 'time-pos' && typeof m.value === 'number') setPos(m.value);
      if (m.name === 'duration' && typeof m.value === 'number') setDur(m.value);
      if (m.name === 'pause') {
        const paused = m.value !== false;
        useStore.getState().setPlaying(!paused);
        void window.lyra.mpris('state', paused ? 'Paused' : 'Playing');
      }
    });
    api.onEnded?.(() => {
      const st = useStore.getState();
      st.setPlaying(false);
      void window.lyra.mpris('state', 'Stopped');
      if (st.repeat === 'one' && st.current) {
        void window.lyra.control('seek', 0).then(() => window.lyra.control('play'));
        st.setPlaying(true);
        return;
      }
      // endless wave: top up when running dry
      if (st.currentPlaylist?.id === 'wave') {
        const rest = st.queue.length - st.index - 1;
        if (rest < 5) {
          void import('./wave').then(({ buildWave }) => buildWave(15, st.queue.map((x) => x.id)).then((more) => {
            if (more.length) useStore.getState().enqueue(more);
          }));
        }
      }
      void advance(1);
    });
    (window.lyra.onMprisCmd as unknown as ((cb: (m: { action: string; arg?: number }) => void) => void) | undefined)?.((m) => {
      const st = useStore.getState();
      if (m.action === 'toggle') void window.lyra.control('toggle');
      else if (m.action === 'play') { void window.lyra.control('play'); st.setPlaying(true); }
      else if (m.action === 'pause') { void window.lyra.control('pause'); st.setPlaying(false); }
      else if (m.action === 'next') void advance(1);
      else if (m.action === 'prev') void advance(-1);
      else if (m.action === 'seek' && typeof m.arg === 'number') void window.lyra.control('seek', m.arg);
      else if (m.action === 'seek-rel' && typeof m.arg === 'number') void window.lyra.control('seek-rel', m.arg);
      else if (m.action === 'volume' && typeof m.arg === 'number') { st.setVolume(m.arg); void window.lyra.control('volume', m.arg); }
    });
  }, []);
  // account statuses refresh on login (sources now live in Settings)
  useEffect(() => {
    void import('./player').then(({ purgeOrphanCache, pruneMissingLocal }) => {
      void purgeOrphanCache();
      void pruneMissingLocal();
    });
    (window.lyra.onLoginDone as unknown as ((cb: (w: string) => void) => void) | undefined)?.(() => {
      useStore.getState().snack(useStore.getState().t('authOk'));
    });
  }, []);

  const pickSource = (id: SourceId): void => {
    pickSourceGo(id);
    if (id === 'spotify' && !useStore.getState().spotifyAcknowledged) setSpotifyOpen(true);
  };
  const toggleRail = (): void => {
    setRailOpen((v) => {
      localStorage.setItem('lyra:rail', v ? 'closed' : 'open');
      return !v;
    });
  };
  const toggleMute = (): void => {
    if (muted) {
      setMuted(false);
      void window.lyra.control('volume', s.volume);
    } else {
      setMuted(true);
      void window.lyra.control('volume', 0);
    }
  };
  const needsSpotifyDialog = s.source === 'spotify' && !s.spotifyAcknowledged;
  const ackSpotify = (): void => { setSpotifyOpen(false); s.setSpotifyAcknowledged(true); };

  return (
    <div className="app">
      <div className="titlebar">
        <div className="win-btns">
          <button className="win-btn" aria-label="Minimize" onClick={() => void window.lyra.win('min')}>
            <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="7.4" width="12" height="1.6" rx={0.8} /></svg>
          </button>
          <button className="win-btn" aria-label="Maximize" onClick={() => void window.lyra.win('max')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="2.8" y="2.8" width="10.4" height="10.4" rx={1.5} /></svg>
          </button>
          <button className="win-btn close" aria-label="Close" onClick={() => void window.lyra.win('close')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
        </div>
      </div>
      <div className="app-body">
      <nav className={'rail' + (railOpen ? ' open' : '')} aria-label="Navigation">
        <button className="rail-logo" onClick={toggleRail} aria-label="Lyra — menu" title="Lyra">
          <LogoIcon size={40} />
          {railOpen && <span className="wordmark">Lyra</span>}
        </button>
        {NAV.map((n) => (
          <button key={n.id} className={'rail-btn' + (s.screen === n.id ? ' active' : '')}
            onClick={() => s.setScreen(n.id)} aria-label={t(n.label)} title={railOpen ? undefined : t(n.label)}>
            <span className="pill"><n.icon size={24} />{railOpen && <span className="in-label">{t(n.label)}</span>}</span>
            {!railOpen && <span className="label-m below">{t(n.label)}</span>}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {s.downloads && s.downloads.total > 0 && (
          railOpen ? (
            <div className="dl-widget" title={`${s.downloads.done} / ${s.downloads.total}`}>
              <div className="body-s" style={{ color: 'var(--on-surface-variant)', marginBottom: 6 }}>
                {s.downloads.done} / {s.downloads.total}
              </div>
              <LinearProgress value={(s.downloads.done / Math.max(1, s.downloads.total)) * 100} label="Downloads" />
            </div>
          ) : (
            <div className="dl-fab" title={`${s.downloads.done} / ${s.downloads.total}`}>
              <svg width={44} height={44} viewBox="0 0 44 44">
                <circle cx={22} cy={22} r={17} fill="none" stroke="var(--surface-container-highest)" strokeWidth={4} />
                <circle cx={22} cy={22} r={17} fill="none" stroke="var(--primary)" strokeWidth={4}
                  strokeLinecap="round" strokeDasharray={106.8}
                  strokeDashoffset={106.8 * (1 - s.downloads.done / Math.max(1, s.downloads.total))}
                  transform="rotate(-90 22 22)" />
              </svg>
              <span className="dl-icon"><I.download size={20} /></span>
            </div>
          )
        )}
      </nav>

      <div className="main-col">
        <header className="topbar">
          <div className="wordmark"><span>Lyra</span></div>
        </header>

        <main className="content">
          <div className={s.screen === 'search' ? 'screen-wrap' : 'screen-wrap screen-hidden'}><Search /></div>
          <div className={s.screen === 'settings' ? 'screen-wrap' : 'screen-wrap screen-hidden'}><Settings /></div>
          <div className={s.screen === 'nowplaying' ? 'screen-wrap' : 'screen-wrap screen-hidden'}><NowPlaying /></div>
          <div className={s.screen === 'home' ? 'screen-wrap' : 'screen-wrap screen-hidden'}><Home /></div>
          <div className={s.screen === 'playlist' ? 'screen-wrap' : 'screen-wrap screen-hidden'}><Playlist /></div>
          <div className={s.screen === 'playlists' ? 'screen-wrap' : 'screen-wrap screen-hidden'}><Library /></div>
        </main>

        {s.screen !== 'nowplaying' && (
        <footer className="player" aria-label="Now playing">
          <div className="player-slider">
            <Slider value={pos} max={dur || 100} label="Position"
              onScrub={(v) => { setPos(v); void window.lyra.control('seek', v); }} />
          </div>
          <div className="row">
            <div className="cover">
              {s.current?.coverUrl && <img src={s.current.coverUrl} alt="" />}
            </div>
            <button className="meta" onClick={() => s.setScreen('nowplaying')}>
              <div className="t1">{s.current ? `${s.current.title}` : t('playEmpty')}</div>
              <div className="t2">
                {s.current ? s.current.artist : t('playHint')}
                {dur > 0 && ` · ${fmt(pos)} / ${fmt(dur)}`}
              </div>
            </button>
            <button className="icon-btn" aria-label="Shuffle" title="Shuffle"
              style={s.shuffle ? { color: 'var(--primary)' } : undefined}
              onClick={() => s.toggleShuffle()}><I.shuffle /></button>
            <button className="icon-btn" aria-label="Previous" onClick={() => void advance(-1)}><P.prev /></button>
            <button className="icon-btn filled" aria-label="Play/Pause" onClick={() => void window.lyra.control('toggle')}>
              {s.playing ? <P.pause /> : <P.play />}
            </button>
            <button className="icon-btn" aria-label="Next" onClick={() => void advance(1)}><P.next /></button>
            <button className="icon-btn" aria-label="Repeat" title={`Repeat: ${s.repeat}`}
              style={s.repeat !== 'off' ? { color: 'var(--primary)' } : undefined}
              onClick={() => s.cycleRepeat()}>
              {s.repeat === 'one' ? <I.repeatOne /> : <I.repeat />}
            </button>
            <span className="vol">
              <button className="icon-btn" aria-label={muted ? t('volUnmute') : t('volMute')} title={t('volLabel')}
                onClick={toggleMute} style={{ width: 40, height: 40 }}>
                <I.volume size={20} />
              </button>
              <Slider small value={muted ? 0 : s.volume} max={100} label={t('volLabel')}
                onScrub={(v) => { setMuted(false); s.setVolume(Math.round(v)); void window.lyra.control('volume', Math.round(v)); }} />
            </span>
          </div>
        </footer>
        )}
      </div>
      </div>

      {(spotifyOpen || needsSpotifyDialog) && (
        <div className="scrim">
          <div className="dialog" role="alertdialog" aria-label="Spotify notice">
            <h2>{t('dlgSpTitle')}</h2>
            <p className="body-m">{t('dlgSpText')}</p>
            <label className="checkbox" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={noShowAgain} onChange={(e) => setNoShowAgain(e.target.checked)} />
              <span className="body-m">{t('dlgNoShow')}</span>
            </label>
            <div className="actions">
              <button className="m3 m3-text" onClick={() => { ackSpotify(); s.setScreen('settings'); }}>{t('dlgSetup')}</button>
              <button className="m3 m3-filled" onClick={ackSpotify}>{t('dlgOk')}</button>
            </div>
          </div>
        </div>
      )}
      {s.snackbar && <div className="snackbar" onAnimationEnd={() => s.snack('')}>{s.snackbar}</div>}
    </div>
  );
}

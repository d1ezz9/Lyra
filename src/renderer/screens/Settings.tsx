import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { SourceId } from '@common/types';
import { themes } from '../themes';
import { DropDown } from '../components/DropDown';
import { Slider } from '../components/Progress';
import { I } from '../icons';
import { fmtSize } from '../format';
import logoUrl from '../assets/logo.png';
import { buildId } from '../i18n';
import type { Lang } from '../i18n';

const ORDER: SourceId[] = ['local', 'soundcloud', 'youtubemusic', 'spotify'];

function Switch({ on, onFlip }: { on: boolean; onFlip: () => void }): React.ReactElement {
  return (
    <label className="switch">
      <input type="checkbox" checked={on} onChange={onFlip} />
      <span className="track" /><span className="thumb" />
    </label>
  );
}

export function Settings(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [ver, setVer] = useState('');
  const [appVer, setAppVer] = useState('');
  const [conn, setConn] = useState<Record<string, { on: boolean; name?: string }>>({});
  const [files, setFiles] = useState<{ path: string; size: number }[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const refreshFiles = async (): Promise<void> => {
    try { setFiles((await window.lyra.dlList()) as { path: string; size: number }[]); }
    catch { setFiles([]); }
  };
  const refresh = async (): Promise<void> => {
    const next: Record<string, { on: boolean; name?: string }> = {};
    for (const id of ['soundcloud', 'youtubemusic', 'spotify']) {
      try {
        const r = (await window.lyra.authStatus(id)) as { connected: boolean; name?: string };
        next[id] = { on: !!r?.connected, name: r?.name };
      } catch { next[id] = { on: false }; }
    }
    setConn(next);
  };
  useEffect(() => {
    void refresh();
    void refreshFiles();
    void (window.lyra.readLog() as Promise<string[]>).then(setLogLines).catch(() => setLogLines([]));
    void (window.lyra.appVersion() as Promise<string>).then(setAppVer).catch(() => undefined);
    void (window.lyra.ytdlpVersion() as Promise<unknown>).then((v: unknown) => setVer(String(v))).catch(() => undefined);
  }, []);
  const logout = async (id: string): Promise<void> => {
    await window.lyra.authClear([id]);
    await refresh();
    s.snack(t('authOut'));
  };
  const srcLabel = (id: SourceId): string =>
    id === 'local' ? t('srcLocal') : id === 'soundcloud' ? t('srcSC') : id === 'youtubemusic' ? t('srcYTM') : t('srcSP');

  return (
    <section>
      <h1 className="headline-s section-title">{t('setTitle')}</h1>

      <h2 className="title-m section-title">{t('setSource')}</h2>
      <div className="card" style={{ cursor: 'default', maxWidth: 640 }}>
        {ORDER.map((id, i) => (
          <button key={id} className={'radio-row' + (s.source === id ? ' active' : '')}
            onClick={() => {
              s.setSource(id);
              if (id === 'spotify' && !s.spotifyAcknowledged) s.setScreen('search');
            }} title={`Ctrl+${i + 1}`}>
            <span className="radio-dot" />
            <span className="texts">
              <span className="body-l">{srcLabel(id)}</span>
              {id !== 'local' && (
                <span className="body-s" style={{ display: 'block', color: 'var(--on-surface-variant)' }}>
                  {conn[id]?.name ?? (conn[id]?.on ? t('setConnected') : t('setNotConn'))}
                </span>
              )}
            </span>
            {id !== 'local' && <span className={`status-dot ${conn[id]?.on ? 'on' : 'off'}`} />}
          </button>
        ))}
      </div>

      <h2 className="title-m section-title">{t('setThemeSection')}</h2>
      <div className="theme-grid">
        {Object.entries(themes).map(([id, vars]) => (
          <button key={id} className={'theme-card' + (s.theme === id ? ' active' : '')}
            onClick={() => s.setTheme(id as never)}>
            <span className="theme-preview" style={{ background: vars['--bg'] }}>
              <span className="tp-bar" style={{ background: vars['--surface'] }} />
              <span className="tp-row">
                <span className="tp-dot" style={{ background: vars['--primary'] }} />
                <span className="tp-lines">
                  <span style={{ background: vars['--text'] }} />
                  <span style={{ background: vars['--on-surface-variant'] ?? vars['--text'] }} />
                </span>
              </span>
              <span className="tp-btn" style={{ background: vars['--primary'] }} />
            </span>
            <span className="theme-palette">
              {[vars['--primary'], vars['--secondary'], vars['--surface'], vars['--text']].map((c, i) => (
                <span key={i} className="pal-dot" style={{ background: c }} />
              ))}
            </span>
            <span className="body-m">{id}</span>
            {s.theme === id && <span className="theme-check"><I.check size={18} /></span>}
          </button>
        ))}
      </div>
      <div className="set-row">
        <div className="texts"><div className="body-l">{t('setFollowSys')}</div></div>
        <Switch on={s.followSystem} onFlip={() => s.setFollowSystem(!s.followSystem)} />
      </div>
      <div className="set-row">
        <div className="texts"><div className="body-l">{t('setLang')}</div></div>
        <DropDown label={t('setLang')} value={s.lang}
          options={[{ v: 'ru', label: 'Русский' }, { v: 'en', label: 'English' }]}
          onPick={(v) => s.setLang(v as Lang)} />
      </div>

      <h2 className="title-m section-title">{t('setPlayback')}</h2>
      <div className="set-row">
        <div className="texts">
          <div className="body-l">{t('setFade')}</div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>
            {t('setFadeDur')}: {(s.crossfadeMs / 1000).toFixed(1)}s
          </div>
        </div>
        <span style={{ width: 160 }}>
          <Slider small value={s.crossfadeMs} max={5000} label={t('setFadeDur')}
            onScrub={(v) => s.setCrossfadeMs(Math.round(v / 100) * 100)} />
        </span>
        <Switch on={s.crossfade} onFlip={() => s.setCrossfade(!s.crossfade)} />
      </div>
      <div className="set-row">
        <div className="texts">
          <div className="body-l">{t('setAutoDl')}</div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{t('setAutoDlHint')}</div>
        </div>
        <Switch on={s.autoDownload} onFlip={() => s.setAutoDownload(!s.autoDownload)} />
      </div>

      <h2 className="title-m section-title">{t('setWidgets')}</h2>
      {([
        ['cont', 'wgCont'],
        ['charts', 'wgCharts'],
        ['shortcuts', 'wgShortcuts'],
        ['recent', 'hmRecent'],
        ['stats', 'hmStats'],
      ] as const).map(([k, label]) => (
        <div key={k} className="set-row">
          <div className="texts"><div className="body-l">{t(label)}</div></div>
          <button className="icon-btn" aria-label="Move up" style={{ width: 40, height: 40 }}
            onClick={() => s.moveWidget(k, -1)}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" /></svg>
          </button>
          <button className="icon-btn" aria-label="Move down" style={{ width: 40, height: 40 }}
            onClick={() => s.moveWidget(k, 1)}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg>
          </button>
          <Switch on={s.widgets[k]} onFlip={() => s.setWidget(k, !s.widgets[k])} />
        </div>
      ))}

      <h2 className="title-m section-title">{t('setSpSound')}</h2>
      <p className="body-s" style={{ color: 'var(--on-surface-variant)', margin: '0 8px 8px' }}>{t('setSpNote')}</p>
      <div className="set-row">
        <div className="texts">
          <div className="body-l">{t('setOrder')}</div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{t('setFallback')}</div>
        </div>
        <DropDown label={t('setOrder')} value={s.audioOrder.join(',')}
          options={[
            { v: 'soundcloud,youtubemusic', label: 'SoundCloud → YouTube Music' },
            { v: 'youtubemusic,soundcloud', label: 'YouTube Music → SoundCloud' },
          ]}
          onPick={(v) => s.setAudioOrder(v.split(',') as never)} />
      </div>

      <h2 className="title-m section-title">{t('setAccounts')}</h2>
      {([
        ['soundcloud', 'SoundCloud'],
        ['youtubemusic', 'YouTube Music'],
        ['spotify', 'Spotify'],
      ] as const).map(([id, label]) => (
        <div key={id} className="set-row">
          <div className="avatar"><I.account /></div>
          <div className="texts">
            <div className="body-l">{label}{conn[id]?.name ? ` · ${conn[id].name}` : ''}</div>
            <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>
              <span className={`status-dot ${conn[id]?.on ? 'on' : 'off'}`} />{conn[id]?.on ? (conn[id]?.name ?? t('setConnected')) : t('setNotConn')}
            </div>
          </div>
          {conn[id]?.on ? (
            <button className="m3 m3-outline" onClick={() => void logout(id)}>{t('setLogout')}</button>
          ) : (
            <button className="m3 m3-tonal" onClick={() => {
              if (id === 'spotify') {
                void (window.lyra.spotifyOauth() as Promise<boolean>)
                  .then(() => setTimeout(() => void refresh(), 1000))
                  .catch((e: unknown) => s.snack(String(e).includes('need-setup') ? t('searchNeedId') : t('searchErr')));
              } else {
                void window.lyra.login(id).then(() => setTimeout(() => void refresh(), 1500));
              }
            }}>{t('setLogin')}</button>
          )}
        </div>
      ))}
      <p className="body-s" style={{ color: 'var(--on-surface-variant)', margin: '8px' }}>{t('setYtWarn')}</p>

      <h2 className="title-m section-title">{t('setMaint')}</h2>
      <div className="set-row">
        <div className="texts"><div className="body-l">{t('setYtdlp')}</div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{ver || t('setUnknown')}</div>
        </div>
        <button className="m3 m3-outline" onClick={() => { void (window.lyra.ytdlpVersion() as Promise<unknown>).then((v: unknown) => setVer(String(v))); }}>{t('setVersion')}</button>
        <button className="m3 m3-filled" onClick={() => { void (window.lyra.ytdlpUpdate() as Promise<unknown>).then((v: unknown) => { setVer(String(v)); s.snack(t('setUpdated')); }); }}>{t('setUpdate')}</button>
      </div>
      <details style={{ margin: '8px' }}><summary className="label-l" style={{ cursor: 'pointer' }}>{t('setLog')}</summary>
        <p className="body-m">{t('setLogText')}</p>
        <div style={{ margin: '8px 0' }}>
          <button className="m3 m3-tonal" style={{ height: 32 }}
            onClick={() => {
              try { void navigator.clipboard.writeText(logLines.join('\n')); s.snack('OK'); } catch { /* noop */ }
            }}>Copy</button>
        </div>
        <pre className="body-s" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-container-low)', borderRadius: 8, padding: 12, maxHeight: 240, overflow: 'auto' }}>
          {logLines.length ? logLines.join('\n') : '—'}
        </pre>
      </details>

      <h2 className="title-m section-title">{t('setDlFiles')}</h2>
      <div className="set-row">
        <div className="texts"><div className="body-l">{t('dlFormat')}</div></div>
        <DropDown label={t('dlFormat')} value={s.dlFormat}
          options={['opus', 'mp3', 'm4a', 'flac'].map((f) => ({ v: f, label: f }))}
          onPick={(v) => s.setDlFormat(v)} />
      </div>
      {files.length === 0 && (
        <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '0 8px' }}>{t('dlEmpty')}</p>
      )}
      {files.map((f) => (
        <div key={f.path} className="set-row">
          <div className="texts">
            <div className="body-m">{f.path.split('/').pop()}</div>
            <div className="body-s" style={{ color: 'var(--on-surface-variant)' }}>{f.path} · {fmtSize(f.size)}</div>
          </div>
          <button className="icon-btn" aria-label="Delete"
            onClick={() => {
              void (window.lyra.dlDelete([f.path]) as Promise<number>).then(() => {
                void import('../player').then(({ dropCacheForFiles }) => dropCacheForFiles([f.path]));
                void refreshFiles();
              });
            }}>
            <I.close size={20} />
          </button>
        </div>
      ))}
      {files.length > 0 && (
        <div style={{ margin: '12px 8px' }}>
          <button className="m3 m3-outline" onClick={() => {
            const paths = files.map((f) => f.path);
            void (window.lyra.dlDelete(paths) as Promise<number>).then(() => {
              void import('../player').then(({ dropCacheForFiles }) => dropCacheForFiles(paths));
              void refreshFiles();
            });
          }}>{t('dlDeleteAll')}</button>
        </div>
      )}

      <div className="set-row">
        <img src={logoUrl} width={48} height={48} alt="Lyra" style={{ borderRadius: 12 }} />
        <div className="texts">
          <div className="body-l">{t('setAbout')}</div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{t('setAboutText')}</div>
          <div className="body-s" style={{ color: 'var(--on-surface-variant)' }}>{appVer} · {buildId()}</div>
        </div>
      </div>
    </section>
  );
}

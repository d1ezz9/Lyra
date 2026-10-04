import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Track } from '@common/types';
import { playTrack } from '../player';
import { I } from '../icons';

interface Pl { id: string; title: string; trackCount?: number; coverUrl?: string; covers?: string[]; }

export function Library(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<(Track | Pl)[]>([]);
  const [itemsBusy, setItemsBusy] = useState(false);

  const scan = async (folders: string[]): Promise<void> => {
    setBusy(true);
    try {
      setTracks((await window.lyra.localScan(folders)) as Track[]);
    } catch { s.snack(t('searchErr')); }
    setBusy(false);
  };

  useEffect(() => {
    if (s.source !== 'local') return;
    if (s.localFolders.length) { void scan(s.localFolders); return; }
    void (async () => {
      try {
        const dir = (await window.lyra.defaultMusicDir()) as string;
        if (dir) { s.setLocalFolders([dir]); await scan([dir]); }
      } catch { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.source]);

  useEffect(() => {
    if (s.source === 'local') return;
    setItems([]);
    void (window.lyra.authStatus(s.source) as Promise<{ connected: boolean; name?: string }>)
      .then((r) => setConnected(!!r?.connected)).catch(() => setConnected(false));
  }, [s.source]);

  // online library content once connected
  useEffect(() => {
    if (s.source === 'local' || !connected) return;
    void loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, s.source, tab]);

  const tabsFor = (src: string): string[] =>
    src === 'soundcloud' ? ['likes', 'playlists']
      : src === 'spotify' ? ['playlists', 'liked', 'albums'] : [];

  const loadTab = async (ti: number): Promise<void> => {
    const tabs = tabsFor(s.source);
    const kind = tabs[ti] ?? tabs[0];
    if (!kind) return;
    setItemsBusy(true);
    try {
      let list: (Track | Pl)[];
      if (s.source === 'soundcloud') list = (await window.lyra.scLibrary(kind)) as (Track | Pl)[];
      else if (s.source === 'spotify') list = (await window.lyra.spotifyLibrary(kind)) as (Track | Pl)[];
      else list = [];
      setItems(list);
      // collage covers for playlist cards (best-effort, background)
      const pls = list.filter((x) => !isTrack(x)) as Pl[];
      if (pls.length) {
        void Promise.all(pls.map(async (p) => {
          try {
            const pid = p.id.includes('playlist:') ? p.id.split('playlist:')[1] : p.id;
            const covers = (await window.lyra.playlistCovers(s.source, pid)) as string[];
            if (covers.length) {
              setItems((prev) => prev.map((y) => (y.id === p.id ? { ...y, covers } : y)));
            }
          } catch { /* noop */ }
        }));
      }
    } catch { s.snack(t('searchErr')); setItems([]); }
    setItemsBusy(false);
  };

  const pick = async (): Promise<void> => {
    const r = await window.lyra.localPick();
    if (!r) return;
    s.setLocalFolders(r.folders);
    setTracks(r.tracks as Track[]);
  };

  const play = async (tr: Track): Promise<void> => {
    s.enqueue([tr]);
    s.setIndex(useStore.getState().queue.length - 1);
    await playTrack(tr);
  };

  const openPlaylist = async (pl: Pl): Promise<void> => {
    try {
      const pid = pl.id.includes('playlist:') ? Number(pl.id.split('playlist:')[1]) : undefined;
      const list = (await window.lyra.playlistTracks(s.source, { playlistId: pid, id: pl.id })) as Track[];
      if (!list.length) { s.snack(t('searchNoRes')); return; }
      const { openPlaylistWithLocal } = await import('../playlists');
      await openPlaylistWithLocal(pl.id, s.source, pl.title, list);
    } catch { s.snack(t('searchErr')); }
  };

  const downloadAll = async (pl: Pl): Promise<void> => {
    try {
      const pid = pl.id.includes('playlist:') ? Number(pl.id.split('playlist:')[1]) : undefined;
      const list = (await window.lyra.playlistTracks(s.source, { playlistId: pid, id: pl.id })) as Track[];
      if (!list.length) { s.snack(t('searchNoRes')); return; }
      const { downloadPlaylist } = await import('../playlists');
      s.snack(t('dlStarted'));
      await downloadPlaylist(pl.id, list, 'opus', (p) => {
        if (p.done + p.skipped >= p.total) s.snack(`${t('dlAllDone')} · ${p.skipped} ${t('dlSkipped')}`);
      });
    } catch { s.snack(t('searchErr')); }
  };

  const isTrack = (x: Track | Pl): x is Track => (x as Track).artist !== undefined && !(x as Pl).trackCount;

  return (
    <section>
      <h1 className="headline-s section-title">{t('libTitle')} · {s.source}</h1>
      {s.source === 'local' ? (
        <>
          <div style={{ margin: '0 8px 12px', display: 'flex', gap: 8 }}>
            <button className="m3 m3-filled" onClick={() => void pick()}><I.add size={18} /> {t('libAddFolder')}</button>
            {s.localFolders.length > 0 && (
              <button className="m3 m3-tonal" disabled={busy} onClick={() => void scan(s.localFolders)}>
                <I.refresh size={18} /> {t('libRescan')}
              </button>
            )}
          </div>
          {s.localFolders.length === 0 && !busy && (
            <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '0 8px' }}>{t('libNoFolders')}</p>
          )}
          {tracks.length > 0 && (
            <p className="body-s" style={{ color: 'var(--on-surface-variant)', margin: '0 8px 8px' }}>
              {tracks.length} {t('libTracks')}
            </p>
          )}
          {tracks.map((tr) => (
            <div key={tr.id} className="list-item" role="button" tabIndex={0} onClick={() => void play(tr)}>
              <span className="leading"><I.music /></span>
              <span className="texts"><span className="t1">{tr.title}</span><span className="t2">{tr.artist}</span></span>
              <span className="trail"><span className="icon-btn" aria-hidden="true"><I.play /></span></span>
            </div>
          ))}
        </>
      ) : !connected ? (
        <div className="card" style={{ cursor: 'default', maxWidth: 520 }}>
          <div className="cover"><I.account size={40} /></div>
          <div className="title-s">{s.source}</div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '8px 0 16px' }}>
            <span className="status-dot off" />
            {t('libLoginHint')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="m3 m3-tonal" onClick={() => {
              if (s.source === 'spotify') {
                void (window.lyra.spotifyOauth() as Promise<boolean>)
                  .catch((e: unknown) => s.snack(String(e).includes('need-setup') ? t('searchNeedId') : t('searchErr')));
              } else void window.lyra.login(s.source);
            }}>{t('libLogin')}</button>
            <button className="m3 m3-outline" onClick={() => s.setScreen('search')}>{t('libGoSearch')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {tabsFor(s.source).map((tb, i) => (
              <button key={tb} role="tab" aria-selected={tab === i} className={tab === i ? 'active' : ''}
                onClick={() => setTab(i)}>{tb}</button>
            ))}
            <span style={{ flex: 1 }} />
            <button className="m3 m3-text" onClick={() => void window.lyra.authClear([s.source]).then(() => setConnected(false))}>
              {t('setLogout')}
            </button>
          </div>
          {itemsBusy && <p className="body-m" style={{ margin: '16px 8px' }}>{t('searchWait')}</p>}
          {tabsFor(s.source)[tab] === 'playlists' || tabsFor(s.source)[tab] === 'albums' ? (
            <div className="grid">
              {(items.filter((x) => !isTrack(x)) as Pl[]).map((p) => (
                <div key={p.id} className="card elevated" role="button" tabIndex={0}
                  onClick={() => void openPlaylist(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void openPlaylist(p); }}>
                  <div className="collage">
                    {[0, 1, 2, 3].map((k) => (
                      <span key={k} className="cell">
                        {p.covers?.[k] ? <img src={p.covers[k]} alt="" /> : <I.music size={24} />}
                      </span>
                    ))}
                  </div>
                  <div className="title-s" style={{ marginTop: 8 }}>{p.title}</div>
                  <div className="body-s" style={{ color: 'var(--on-surface-variant)' }}>
                    {p.trackCount ? `${p.trackCount} ${t('libTracks')}` : ''}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button className="m3 m3-tonal" style={{ height: 36 }}
                      onClick={(e) => { e.stopPropagation(); void downloadAll(p); }}>
                      <I.download size={18} /> {t('dlAll')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {items.filter((x) => isTrack(x)).map((x, i) => (
            <div key={x.id + i} className="list-item" role="button" tabIndex={0} onClick={() => void play(x as Track)}>
              <span className="leading">{x.coverUrl ? <img src={x.coverUrl} alt="" /> : <I.music />}</span>
              <span className="texts"><span className="t1">{x.title}</span><span className="t2">{(x as Track).artist}</span></span>
              <span className="trail"><span className="icon-btn" aria-hidden="true"><I.play /></span></span>
            </div>
          ))}
        </>
      )}
      {s.source === 'local' && (
        <div className="fab-row">
          <button className="fab" aria-label={t('libAddFolder')} title={t('libAddFolder')} onClick={() => void pick()}><I.folderAdd /></button>
        </div>
      )}
    </section>
  );
}

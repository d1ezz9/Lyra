import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Track } from '@common/types';
import { playTrack, playIndex, playSingle, readHistory, type HistItem } from '../player';
import { I } from '../icons';
import { P } from '../icons';
import { fmtSize } from '../format';

interface SpPl { id: string; title: string; trackCount?: number; coverUrl?: string; }

const CATALOG: { id: 'cont' | 'charts' | 'shortcuts' | 'recent' | 'stats'; label: 'hmContinue' | 'hmCharts' | 'hmShortcuts' | 'hmRecent' | 'hmStats' }[] = [
  { id: 'cont', label: 'hmContinue' },
  { id: 'charts', label: 'hmCharts' },
  { id: 'shortcuts', label: 'hmShortcuts' },
  { id: 'recent', label: 'hmRecent' },
  { id: 'stats', label: 'hmStats' },
];

function PencilIcon(): React.ReactElement {
  return (<svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>);
}

export function Home(): React.ReactElement {
  const s = useStore();
  const t = s.t;
  const [charts, setCharts] = useState<Track[]>([]);
  const [spPlaylists, setSpPlaylists] = useState<SpPl[]>([]);
  const [recent, setRecent] = useState<HistItem[]>([]);
  const [stats, setStats] = useState<{ files: number; bytes: number; folders: number } | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (s.source === 'soundcloud') {
      void (window.lyra.scCharts() as Promise<Track[]>).then(setCharts).catch(() => setCharts([]));
    } else setCharts([]);
    if (s.source === 'spotify') {
      void (window.lyra.spotifyLibrary('playlists') as Promise<SpPl[]>).then(setSpPlaylists).catch(() => setSpPlaylists([]));
    } else setSpPlaylists([]);
    setRecent(readHistory());
    void (window.lyra.dlList() as Promise<{ path: string; size: number }[]>)
      .then((f) => setStats({ files: f.length, bytes: f.reduce((a, x) => a + x.size, 0), folders: s.localFolders.length }))
      .catch(() => setStats(null));
  }, [s.source, s.screen, s.localFolders]);

  const resume = async (): Promise<void> => {
    const st = useStore.getState();
    if (!st.queue.length) return;
    st.setScreen('nowplaying');
    await playTrack(st.queue[st.index] ?? st.queue[0]);
  };

  const playChart = (tr: Track): void => {
    void playSingle(tr);
  };

  const playHist = async (h: HistItem): Promise<void> => {
    const st = useStore.getState();
    const qi = st.queue.findIndex((x) => x.id === h.id);
    const tr: Track = { id: h.id, source: h.source as Track['source'], title: h.title, artist: h.artist, duration: 0, url: h.url, coverUrl: h.coverUrl, localPath: h.localPath };
    if (qi >= 0) void playIndex(qi);
    else {
      st.enqueue([tr]);
      void playIndex(useStore.getState().queue.length - 1);
    }
  };

  const openSpPlaylist = async (pl: SpPl): Promise<void> => {
    try {
      const list = (await window.lyra.spotifyPlaylistTracks(pl.id)) as Track[];
      if (!list.length) { s.snack(t('searchNoRes')); return; }
      const { openPlaylistWithLocal } = await import('../playlists');
      await openPlaylistWithLocal(pl.id, 'spotify', pl.title, list);
    } catch { s.snack(t('searchErr')); }
  };

  const cur = s.queue[s.index];
  const wrap = (id: string, body: React.ReactElement | null): React.ReactElement | null => {
    if (!body) return null;
    if (!editing) return <React.Fragment key={id}>{body}</React.Fragment>;
    return (
      <div key={id} className="card elevated widget-edit" style={{ gridColumn: '1 / -1' }}>
        <button className="icon-btn widget-remove" aria-label="Remove"
          onClick={() => s.setWidget(id as never, false)}><I.close size={20} /></button>
        <div style={{ opacity: 0.75, pointerEvents: 'none' }}>{body}</div>
      </div>
    );
  };

  const widgets: Record<string, React.ReactElement | null> = {
    cont: s.widgets.cont && s.queue.length > 0 ? (
      <div className="card elevated" style={{ cursor: 'default', gridColumn: '1 / -1' }}>
        <div className="title-m">{t('hmContinue')}</div>
        <div className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '4px 0 12px' }}>
          {cur ? `${cur.artist} — ${cur.title}` : ''}
        </div>
        <button className="m3 m3-filled" onClick={() => void resume()}>
          <P.play size={20} /> {t('hmResume')}
        </button>
      </div>
    ) : null,
    recent: s.widgets.recent && recent.length > 0 ? (
      <div className="card" style={{ cursor: 'default', gridColumn: '1 / -1' }}>
        <div className="title-m" style={{ marginBottom: 8 }}>{t('hmRecent')}</div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 0 8px' }}>
          {recent.slice(0, 10).map((h) => (
            <button key={h.id} className="card elevated" style={{ minWidth: 168, maxWidth: 168 }}
              onClick={() => void playHist(h)}>
              <div className="cover" style={{ height: 140 }}>
                {h.coverUrl ? <img src={h.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : <I.music size={40} />}
              </div>
              <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
              <div className="body-s" style={{ color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.artist}</div>
            </button>
          ))}
        </div>
      </div>
    ) : null,
    charts: !s.widgets.charts ? null : s.source === 'soundcloud' ? (
      <div className="card" style={{ cursor: 'default', gridColumn: '1 / -1' }}>
        <div className="title-m" style={{ marginBottom: 8 }}>{t('hmCharts')}</div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 0 8px' }}>
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
      </div>
    ) : s.source === 'spotify' ? (
      <div className="card" style={{ cursor: 'default', gridColumn: '1 / -1' }}>
        <div className="title-m" style={{ marginBottom: 8 }}>Spotify</div>
        {spPlaylists.length === 0 && (
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{t('chartsNa')}</div>
        )}
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 0 8px' }}>
          {spPlaylists.map((pl) => (
            <button key={pl.id} className="card elevated" style={{ minWidth: 168, maxWidth: 168 }}
              onClick={() => void openSpPlaylist(pl)}>
              <div className="cover" style={{ height: 140 }}>
                {pl.coverUrl ? <img src={pl.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : <I.playlists size={40} />}
              </div>
              <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.title}</div>
              <div className="body-s" style={{ color: 'var(--on-surface-variant)' }}>{pl.trackCount ?? ''}</div>
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div className="card" style={{ cursor: 'default', gridColumn: '1 / -1' }}>
        <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{t('chartsNa')}</div>
      </div>
    ),
    shortcuts: s.widgets.shortcuts ? (
      <div className="card" style={{ cursor: 'default' }}>
        <div className="title-m">{t('hmShortcuts')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="m3 m3-tonal" onClick={() => s.setScreen('search')}><I.search size={20} /> {t('navSearch')}</button>
          <button className="m3 m3-tonal" onClick={() => s.setScreen('settings')}><I.settings size={20} /> {t('navSettings')}</button>
        </div>
      </div>
    ) : null,
    stats: s.widgets.stats && stats ? (
      <div className="card" style={{ cursor: 'default' }}>
        <div className="title-m">{t('hmStats')}</div>
        <div className="body-m" style={{ color: 'var(--on-surface-variant)', marginTop: 8 }}>
          {stats.files} · {fmtSize(stats.bytes)} · {stats.folders} {t('libTracks')}
        </div>
      </div>
    ) : null,
  };

  const hidden = CATALOG.filter((c) => {
    if (c.id === 'cont') return !s.widgets.cont;
    if (c.id === 'charts') return !s.widgets.charts;
    if (c.id === 'shortcuts') return !s.widgets.shortcuts;
    if (c.id === 'recent') return !s.widgets.recent;
    return !s.widgets.stats;
  });

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', margin: '16px 8px 16px' }}>
        <h1 className="headline-s" style={{ margin: 0, flex: 1 }}>Lyra</h1>
        <button className={'icon-btn' + (editing ? ' active-ib' : '')} aria-label={editing ? t('hmDone') : t('hmEdit')}
          title={editing ? t('hmDone') : t('hmEdit')}
          style={editing ? { color: 'var(--primary)' } : undefined}
          onClick={() => setEditing((v) => !v)}>
          {editing ? <I.check size={22} /> : <PencilIcon />}
        </button>
      </div>
      <div className="grid">
        {s.widgetsOrder.map((k) => wrap(k, widgets[k] ?? null)).filter(Boolean)}
        {editing && hidden.length > 0 && (
          <div className="card card-dash" style={{ gridColumn: '1 / -1' }}>
            <div className="title-m" style={{ marginBottom: 8 }}>{t('hmAdd')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hidden.map((c) => (
                <button key={c.id} className="m3 m3-tonal" onClick={() => s.setWidget(c.id, true)}>
                  <I.add size={18} /> {t(c.label)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

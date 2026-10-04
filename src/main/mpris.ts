import type { Track } from '../../common/types';

/** Full MPRIS2 via mpris-service: playerctl, DE widgets, media keys all work. */
export class Mpris {
  private player: {
    metadata: unknown; playbackStatus: string; volume: number; position: number;
    canGoNext: boolean; canGoPrevious: boolean; canPlay: boolean; canPause: boolean;
    canSeek: boolean; canControl: boolean;
    getPosition?: () => number;
    on: (ev: string, cb: (...a: never[]) => void) => void;
  } | null = null;

  onAction: (action: 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'seek' | 'seek-rel' | 'volume', arg?: number) => void = () => {};
  onQuit: () => void = () => {};
  onRaise: () => void = () => {};
  getPosition: () => number = () => 0; // seconds

  async init(identity = 'Lyra', log?: (m: string) => void): Promise<void> {
    const say = (m: string): void => { try { log?.(m); } catch { /* noop */ } };
    try {
      const mod = (await import('mpris-service')) as unknown as {
        default?: new (o: Record<string, unknown>) => NonNullable<Mpris['player']>;
      } & { Player?: new (o: Record<string, unknown>) => NonNullable<Mpris['player']> };
      const Ctor = mod.default ?? mod.Player ?? (mod as unknown as new (o: Record<string, unknown>) => NonNullable<Mpris['player']>);
      const p = new Ctor({
        name: 'lyra', identity,
        supportedUriSchemes: ['file', 'http', 'https'],
        supportedMimeTypes: ['audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/opus', 'audio/mp4', 'audio/x-wav'],
        supportedInterfaces: ['player'],
      });
      p.canControl = true; p.canPlay = true; p.canPause = true;
      p.canSeek = true; p.canGoNext = true; p.canGoPrevious = true;
      p.playbackStatus = 'Stopped';
      p.volume = 0.8;
      p.getPosition = () => Math.round(this.getPosition() * 1e6);
      p.on('play', () => this.onAction('play'));
      p.on('pause', () => this.onAction('pause'));
      p.on('playpause', () => this.onAction('toggle'));
      p.on('stop', () => this.onAction('pause'));
      p.on('next', () => this.onAction('next'));
      p.on('previous', () => this.onAction('prev'));
      p.on('seek', (offset: unknown) => this.onAction('seek-rel', Math.round(Number(offset) / 1e6)));
      p.on('position', (e: unknown) => {
        const pos = (e as { position?: number }).position;
        if (typeof pos === 'number') this.onAction('seek', Math.round(pos / 1e6));
      });
      p.on('volume', (v: unknown) => this.onAction('volume', Math.round(Number(v) * 100)));
      p.on('quit', () => this.onQuit());
      p.on('raise', () => this.onRaise());
      this.player = p;
      say('mpris: registered org.mpris.MediaPlayer2.lyra');
    } catch (e) {
      say(`mpris: init failed: ${String(e).slice(0, 300)}`);
      this.player = null;
    }
  }

  updateTrack(t: Track | undefined): void {
    if (!this.player) return;
    try {
      this.player.metadata = t ? {
        'mpris:trackid': `/lyra/${t.id.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        'mpris:length': Math.round(t.duration * 1e6),
        'xesam:title': t.title,
        'xesam:artist': [t.artist],
        'xesam:album': t.album ?? '',
        'mpris:artUrl': t.coverUrl ?? t.coverPath ?? '',
      } : {};
    } catch { /* noop */ }
  }

  updateState(status: 'Playing' | 'Paused' | 'Stopped'): void {
    if (!this.player) return;
    try { this.player.playbackStatus = status; } catch { /* noop */ }
  }

  updatePosition(sec: number): void {
    if (!this.player) return;
    try { this.player.position = Math.round(sec * 1e6); } catch { /* noop */ }
  }

  updateVolume(v01: number): void {
    if (!this.player) return;
    try { this.player.volume = Math.max(0, Math.min(1, v01)); } catch { /* noop */ }
  }
}

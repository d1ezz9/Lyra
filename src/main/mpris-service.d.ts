declare module 'mpris-service' {
  class Player {
    constructor(opts: Record<string, unknown>);
    metadata: unknown;
    playbackStatus: string;
    volume: number;
    position: number;
    canControl: boolean;
    canPlay: boolean;
    canPause: boolean;
    canSeek: boolean;
    canGoNext: boolean;
    canGoPrevious: boolean;
    getPosition?: () => number;
    on(ev: string, cb: (...a: never[]) => void): void;
  }
  export = Player;
}

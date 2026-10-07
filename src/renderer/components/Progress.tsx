import React, { useRef, useCallback } from 'react';

interface SliderProps {
  value: number; max: number; onScrub: (v: number) => void; label: string; small?: boolean;
}

/** Material 3 slider: 4dp rounded track, round handle, 24dp+ touch target. */
export function Slider({ value, max, onScrub, label, small }: SliderProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  const toValue = useCallback((clientX: number): void => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onScrub(t * max);
  }, [max, onScrub]);

  return (
    <div className={'slider' + (small ? ' small' : '')} role="slider" tabIndex={0}
      aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); toValue(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons & 1) toValue(e.clientX); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onScrub(Math.min(max, value + max / 20));
        if (e.key === 'ArrowLeft') onScrub(Math.max(0, value - max / 20));
      }}>
      <div className="slider-gutter">
        <div ref={ref} className="slider-track">
          <div className="slider-active" style={{ width: `${ratio * 100}%` }} />
          <div className="slider-state" style={{ left: `${ratio * 100}%` }} />
          <div className="slider-thumb" style={{ left: `${ratio * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Material 3 linear progress indicator (determinate + indeterminate). */
export function LinearProgress({ value, label }: { value?: number; label: string }): React.ReactElement {
  if (value === undefined) {
    return (
      <div className="linear" role="progressbar" aria-label={label}>
        <div className="linear-bar1" /><div className="linear-bar2" />
      </div>
    );
  }
  return (
    <div className="linear" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)}>
      <div className="linear-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

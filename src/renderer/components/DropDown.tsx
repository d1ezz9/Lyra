import React, { useState } from 'react';

function ExpandIcon(): React.ReactElement {
  return (<svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>);
}

/** M3 exposed dropdown menu (replaces native <select> everywhere). */
export function DropDown({ value, options, onPick, label }: {
  value: string; options: { v: string; label: string }[]; onPick: (v: string) => void; label: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.v === value);
  return (
    <div className="drop" aria-label={label}>
      <button className="drop-field" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="body-l">{cur?.label ?? value}</span>
        <ExpandIcon />
      </button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="menu" role="listbox" style={{ left: 'auto', right: 0 }}>
            {options.map((o) => (
              <button key={o.v} role="option" aria-selected={o.v === value}
                className={'menu-item' + (o.v === value ? ' active' : '')}
                onClick={() => { onPick(o.v); setOpen(false); }}>
                <span className="body-l">{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

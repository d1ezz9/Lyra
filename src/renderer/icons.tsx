import React from 'react';

/** Official Material Symbols / Material Icons paths (24dp, fill). */
type P = { size?: number };
const S = (size = 24): { width: number; height: number; viewBox: string; fill: string } => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor',
});

export const I = {
  home: (p: P) => (<svg {...S(p.size)}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>),
  search: (p: P) => (<svg {...S(p.size)}><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>),
  playlists: (p: P) => (<svg {...S(p.size)}><path d="M3 10h11v2H3v-2zm0-4h11v2H3V6zm0 8h7v2H3v-2zm13-1v8l6-4-6-4z" /></svg>),
  queue: (p: P) => (<svg {...S(p.size)}><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" /></svg>),
  download: (p: P) => (<svg {...S(p.size)}><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>),
  settings: (p: P) => (<svg {...S(p.size)}><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.12.22.37.3.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.24.08.49 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5" /></svg>),
  play: (p: P) => (<svg {...S(p.size)}><path d="M8 5v14l11-7z" /></svg>),
  pause: (p: P) => (<svg {...S(p.size)}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>),
  next: (p: P) => (<svg {...S(p.size)}><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>),
  prev: (p: P) => (<svg {...S(p.size)}><path d="M6 6h2v12H6zm3.5 6l8.5 6V6zM16 6v12h2V6z" /></svg>),
  shuffle: (p: P) => (<svg {...S(p.size)}><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>),
  repeat: (p: P) => (<svg {...S(p.size)}><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /></svg>),
  repeatOne: (p: P) => (<svg {...S(p.size)}><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-8.5-2h1.7l-1.5-3.5 1.2-.5L12.5 14H11v1H8.5v-1z" /></svg>),
  volume: (p: P) => (<svg {...S(p.size)}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>),
  add: (p: P) => (<svg {...S(p.size)}><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v-2z" /></svg>),
  music: (p: P) => (<svg {...S(p.size)}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>),
  check: (p: P) => (<svg {...S(p.size)}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>),
  close: (p: P) => (<svg {...S(p.size)}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>),
  more: (p: P) => (<svg {...S(p.size)}><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>),
  refresh: (p: P) => (<svg {...S(p.size)}><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>),
  account: (p: P) => (<svg {...S(p.size)}><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>),
  folderAdd: (p: P) => (<svg {...S(p.size)}><path d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z" /></svg>),
};

/** Theme-adaptive app logo (BC2 shapes in M3 tonal colors). */
export function LogoIcon({ size = 40 }: P): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--primary-container)" />
      <g stroke="var(--on-primary-container)" strokeLinecap="round" fill="none">
        <path d="M17 14 h30" strokeWidth="5" />
        <path d="M23 22 v24" strokeWidth="5" />
        <path d="M32 22 v30" strokeWidth="5" opacity=".75" />
        <path d="M41 22 v18" strokeWidth="5" opacity=".5" />
      </g>
    </svg>
  );
}
const R = (size = 24): { width: number; height: number; viewBox: string } => ({ width: size, height: size, viewBox: '0 0 24 24' });
export const P = {
  play: (p: P) => (<svg {...R(p.size)} fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M8 5.5v13l11-6.5z" /></svg>),
  pause: (p: P) => (<svg {...R(p.size)} fill="currentColor"><rect x="6" y="5" width="4.4" height="14" rx={2} /><rect x="13.6" y="5" width="4.4" height="14" rx={2} /></svg>),
  next: (p: P) => (<svg {...R(p.size)} fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round"><path d="M5 6.5v11l8.5-5.5z" /><rect x="14.5" y="6" width="3.6" height="12" rx={1.8} stroke="none" /></svg>),
  prev: (p: P) => (<svg {...R(p.size)} fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round"><path d="M19 6.5v11L10.5 12z" /><rect x="5.9" y="6" width="3.6" height="12" rx={1.8} stroke="none" /></svg>),
};

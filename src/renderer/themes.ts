// One object per theme = easy to add new themes.
// Each theme only declares core tokens; full M3 roles are derived in defineTheme().
interface Core {
  mode: 'light' | 'dark';
  primary: string;   // акцент
  bg: string;        // surface-dim / фон
  surface: string;   // базовая поверхность
  text: string;      // on-surface
  secondary?: string;
}

function hex(h: string): [number, number, number] {
  const n = h.replace('#', '');
  const v = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function css([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
}
function mix(a: string, b: string, t: number): string {
  const A = hex(a); const B = hex(b);
  return css([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t) as [number, number, number]);
}
function lum(h: string): number {
  const [r, g, b] = hex(h).map((x) => x / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function defineTheme(c: Core): Record<string, string> {
  const onPrimary = lum(c.primary) > 0.55 ? '#1a1c1e' : '#ffffff';
  const secondary = c.secondary ?? mix(c.primary, c.text, 0.35);
  return {
    '--primary': c.primary,
    '--on-primary': onPrimary,
    '--primary-container': mix(c.primary, c.bg, c.mode === 'dark' ? 0.78 : 0.82),
    '--on-primary-container': mix(c.primary, c.text, c.mode === 'dark' ? 0.25 : 0.55),
    '--secondary': secondary,
    '--secondary-container': mix(secondary, c.bg, 0.78),
    '--on-secondary-container': c.text,
    '--surface-dim': c.bg,
    '--surface': c.bg,
    '--surface-container-lowest': c.mode === 'dark' ? mix(c.surface, '#000000', 0.4) : '#ffffff',
    '--surface-container-low': mix(c.surface, c.text, 0.04),
    '--surface-container': mix(c.surface, c.text, 0.07),
    '--surface-container-high': mix(c.surface, c.text, 0.11),
    '--surface-container-highest': mix(c.surface, c.text, 0.15),
    '--on-surface': c.text,
    '--on-surface-variant': mix(c.text, c.bg, 0.35),
    '--outline': mix(c.text, c.bg, 0.45),
    '--outline-variant': mix(c.text, c.bg, 0.78),
    '--inverse-surface': c.mode === 'dark' ? mix(c.text, c.bg, 0.08) : mix(c.bg, '#000000', 0.75),
    '--inverse-on-surface': c.mode === 'dark' ? c.bg : c.text,
    '--error': c.mode === 'dark' ? '#f2b8b8' : '#ba1a1a',
    '--scrim': '#000000',
    // legacy aliases used by older components
    '--bg': c.bg, '--accent': c.primary, '--text': c.text,
  };
}

const cores: Record<string, Core> = {
  'mono-light': { mode: 'light', primary: '#111111', bg: '#fdfdfd', surface: '#f2f2f2', text: '#111111' },
  'mono-dark': { mode: 'dark', primary: '#e6e6e6', bg: '#0a0a0a', surface: '#141414', text: '#f5f5f5' },
  'nord-light': { mode: 'light', primary: '#4c6a8a', bg: '#eceff4', surface: '#e5e9f0', text: '#2e3440' },
  'nord-dark': { mode: 'dark', primary: '#88c0d0', bg: '#242933', surface: '#2e3440', text: '#eceff4' },
  'material-light': { mode: 'light', primary: '#6750a4', bg: '#fdf8fd', surface: '#f3edf7', text: '#1d1b20' },
  'material-dark': { mode: 'dark', primary: '#d0bcff', bg: '#131318', surface: '#1d1b20', text: '#e6e0e9' },
  'spotify': { mode: 'dark', primary: '#1db954', bg: '#0e0e0e', surface: '#121212', text: '#ffffff' },
  'soundcloud-light': { mode: 'light', primary: '#e64a00', bg: '#fffaf7', surface: '#f5f0ec', text: '#1a130e' },
  'soundcloud-dark': { mode: 'dark', primary: '#ff5500', bg: '#0f0d0b', surface: '#181310', text: '#f7ede6' },
  'catppuccin': { mode: 'dark', primary: '#cba6f7', bg: '#1e1e2e', surface: '#242438', text: '#cdd6f4', secondary: '#f5c2e7' },
  'gruvbox': { mode: 'dark', primary: '#fabd2f', bg: '#282828', surface: '#2e2a26', text: '#ebdbb2', secondary: '#fe8019' },
  'dracula': { mode: 'dark', primary: '#bd93f9', bg: '#282a36', surface: '#2e3040', text: '#f8f8f2', secondary: '#ff79c6' },
  'dynamic': { mode: 'dark', primary: '#d0bcff', bg: '#131318', surface: '#1d1b20', text: '#e6e0e9' },
};

export const themes: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(cores).map(([k, c]) => [k, defineTheme(c)]),
);

/** Dynamic Material-You theme from cover art: pass average/dominant cover color. */
export function setDynamicTheme(coverHex: string, mode: 'light' | 'dark' = 'dark'): void {
  const base = mode === 'dark' ? cores['material-dark'] : cores['material-light'];
  const vars = defineTheme({ ...base, mode, primary: coverHex });
  document.documentElement.dataset.theme = 'dynamic';
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
}

export function applyTheme(id: string): void {
  const t = themes[id] ?? themes['material-dark'];
  document.documentElement.dataset.theme = id;
  for (const [k, v] of Object.entries(t)) document.documentElement.style.setProperty(k, v);
}

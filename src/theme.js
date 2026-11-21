// theme.js — light / dark mode. The choice is per phone (Settings → Appearance).
// index.html applies the saved theme before the page draws, so there's no flash on open.

export const THEMES = { dark: 'Dark', light: 'Light', system: 'Match phone' };

/** 'dark' | 'light' for a saved choice ('system' follows the phone). */
export const resolveTheme = (choice, phonePrefersDark) =>
  choice === 'light' || choice === 'dark' ? choice : phonePrefersDark ? 'dark' : 'light';

const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

/** Applies a theme choice to the page and the phone's status bar. */
export function applyTheme(choice) {
  const q = darkQuery();
  const theme = resolveTheme(choice, q ? q.matches : true);
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#eceef2' : '#000000');
  return theme;
}

/** With "Match phone", follow the phone when it switches between light and dark. */
export function followPhoneTheme(getChoice) {
  const q = darkQuery();
  if (q && q.addEventListener) q.addEventListener('change', () => { if (getChoice() === 'system') applyTheme('system'); });
}

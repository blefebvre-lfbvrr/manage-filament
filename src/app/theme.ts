import type { AppSettings } from '@/lib/schemas';

let mq: MediaQueryList | null = null;
let listener: (() => void) | null = null;

export function applyTheme(theme: AppSettings['theme']) {
  try {
    localStorage.setItem('filatrack:theme', JSON.stringify(theme));
  } catch {
    /* ignoré */
  }
  if (typeof matchMedia === 'undefined') return;
  if (mq && listener) mq.removeEventListener('change', listener);
  mq = matchMedia('(prefers-color-scheme: dark)');
  const update = () =>
    document.documentElement.classList.toggle(
      'dark',
      theme === 'dark' || (theme === 'system' && mq!.matches),
    );
  listener = update;
  mq.addEventListener('change', update);
  update();
}

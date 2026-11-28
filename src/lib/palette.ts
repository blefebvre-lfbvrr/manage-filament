/** Recherche de la palette de commandes (Ctrl+K). Fonctions pures. */
import { normalizeText } from './text';

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
}

/**
 * Tous les mots saisis doivent apparaître (sans accents ni casse) dans le libellé, l'indication
 * ou les mots-clés. Classement : libellé identique, libellé qui commence par la saisie, mot du
 * libellé, puis le reste ; l'ordre d'origine départage.
 */
export function searchPalette<T extends PaletteItem>(query: string, items: T[], limit = 50): T[] {
  const q = normalizeText(query);
  if (!q) return items.slice(0, limit);
  const tokens = q.split(' ');
  const scored: { item: T; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    const label = normalizeText(item.label);
    const hay = `${label} ${normalizeText(item.hint)} ${normalizeText(item.keywords)}`;
    if (!tokens.every((t) => hay.includes(t))) return;
    const score =
      label === q
        ? 0
        : label.startsWith(q)
          ? 1
          : label.split(/[\s-]+/).some((w) => w.startsWith(tokens[0]!))
            ? 2
            : 3;
    scored.push({ item, score, i });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.item);
}

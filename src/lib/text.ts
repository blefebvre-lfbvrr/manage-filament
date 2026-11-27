/** Normalise un texte pour la comparaison : minuscules, sans accents, espaces réduits. */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[«»"“”'’`]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clé de comparaison encore plus permissive (sans ponctuation). */
export function looseKey(value: unknown): string {
  return normalizeText(value)
    .replace(/[^a-z0-9%€]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vrai si tous les mots de la requête apparaissent dans le texte (recherche plein texte). */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const h = normalizeText(haystack);
  return q.split(' ').every((word) => h.includes(word));
}

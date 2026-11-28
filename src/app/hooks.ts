import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { getDb } from '@/db/db';
import { getSettings } from '@/db/repo';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/schemas';

export function useSettings(): AppSettings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
}

export function useSpools(includeDeleted = false) {
  return useLiveQuery(async () => {
    const all = await getDb().spools.toArray();
    return includeDeleted ? all : all.filter((s) => !s.deletedAt);
  }, [includeDeleted]);
}

export function useSpool(id: string | undefined) {
  return useLiveQuery(async () => (id ? ((await getDb().spools.get(id)) ?? null) : null), [id]);
}

export function useCatalog() {
  return useLiveQuery(async () => {
    const db = getDb();
    const [brands, products, colors] = await Promise.all([
      db.brands.toArray(),
      db.products.toArray(),
      db.colors.toArray(),
    ]);
    const alive = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
    return {
      brands: alive(brands).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      products: alive(products),
      colors: alive(colors),
    };
  }, []);
}

export function usePrints() {
  return useLiveQuery(async () => (await getDb().prints.toArray()).filter((p) => !p.deletedAt), []);
}

export function useProjects() {
  return useLiveQuery(
    async () =>
      (await getDb().projects.toArray())
        .filter((p) => !p.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [],
  );
}

export function useLocations() {
  return useLiveQuery(
    async () =>
      (await getDb().locations.toArray())
        .filter((l) => !l.deletedAt)
        .map((l) => l.name)
        .sort((a, b) => a.localeCompare(b, 'fr')),
    [],
    [] as string[],
  );
}

export function useCustomFields(entity: 'spool' | 'print') {
  return useLiveQuery(
    async () =>
      (await getDb().customFieldDefs.where('entity').equals(entity).toArray())
        .filter((d) => !d.deletedAt)
        .sort((a, b) => a.order - b.order),
    [entity],
    [],
  );
}

export function useMovements(spoolId: string | undefined) {
  return useLiveQuery(
    async () => (spoolId ? await getDb().movements.where('spoolId').equals(spoolId).toArray() : []),
    [spoolId],
    [],
  );
}

/** Préférence locale à l'appareil (affichage, colonnes…). Résiste à un stockage indisponible. */
export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const storageKey = `filatrack:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignoré */
    }
  }, [storageKey, value]);
  const set = useCallback((v: T | ((prev: T) => T)) => setValue(v), []);
  return [value, set];
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Nombre d'impressions du cloud Bambu en attente de validation. */
export function usePendingBambuCount() {
  return useLiveQuery(() => getDb().bambuTasks.where('state').equals('pending').count(), [], 0);
}

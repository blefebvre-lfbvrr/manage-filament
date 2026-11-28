import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/components/ui/cn';
import { getDb } from '@/db/db';
import { getGitHubToken } from '@/db/cloud';
import { saveSettings } from '@/db/repo';
import { runSync } from '@/features/projects/CloudSyncButton';
import { searchPalette, type PaletteItem } from '@/lib/palette';
import { SPOOL_STATUS_LABELS } from '@/lib/spool';
import { NAV } from './nav';

const OPEN_EVENT = 'filatrack:palette';
export const openPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

type Item = PaletteItem & { run: () => void };

/** Palette de commandes : Ctrl+K (ou ⌘K) — pages, actions, bobines, projets, impressions. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();

  useEffect(() => {
    const show = () => {
      setQuery('');
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  const data = useLiveQuery(
    async () => {
      if (!open) return null;
      const db = getDb();
      const [spools, projects, prints] = await Promise.all([
        db.spools.toArray(),
        db.projects.toArray(),
        db.prints.toArray(),
      ]);
      return {
        spools: spools.filter((s) => !s.deletedAt),
        projects: projects.filter((p) => !p.deletedAt),
        prints: prints
          .filter((p) => !p.deletedAt)
          .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt))
          .slice(0, 200),
      };
    },
    [open],
    null,
  );

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to);
    const actions: Item[] = [
      {
        id: 'a-spool',
        group: 'Actions',
        label: 'Nouvelle bobine',
        keywords: 'ajouter',
        run: () => navigate(`/?new=${Date.now()}`),
      },
      {
        id: 'a-print',
        group: 'Actions',
        label: 'Nouvelle impression',
        keywords: 'ajouter',
        run: () => navigate(`/prints?new=${Date.now()}`),
      },
      {
        id: 'a-scan',
        group: 'Actions',
        label: 'Scanner une étiquette',
        keywords: 'qr camera',
        run: go('/scan'),
      },
      {
        id: 'a-weigh',
        group: 'Actions',
        label: 'Peser une bobine',
        keywords: 'balance pesee',
        run: go('/weigh'),
      },
      {
        id: 'a-feas',
        group: 'Actions',
        label: 'Puis-je imprimer ça ?',
        keywords: 'faisabilite 3mf',
        run: go('/feasibility'),
      },
      {
        id: 'a-backup',
        group: 'Actions',
        label: 'Sauvegarder mes données',
        keywords: 'export backup json',
        run: go('/data'),
      },
      ...(getGitHubToken()
        ? [
            {
              id: 'a-sync',
              group: 'Actions',
              label: 'Synchroniser maintenant',
              keywords: 'github cloud',
              run: () => void runSync(),
            },
          ]
        : []),
      ...(['light', 'dark', 'system'] as const).map((t) => ({
        id: `a-theme-${t}`,
        group: 'Actions',
        label: `Thème ${t === 'light' ? 'clair' : t === 'dark' ? 'sombre' : 'du système'}`,
        keywords: 'apparence mode',
        run: () => void saveSettings({ theme: t }),
      })),
    ];
    const pages: Item[] = NAV.map((n) => ({
      id: `p-${n.to}`,
      group: 'Pages',
      label: n.label,
      run: go(n.to),
    }));
    const spools: Item[] = (data?.spools ?? [])
      .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }))
      .map((s) => ({
        id: `s-${s.id}`,
        group: 'Bobines',
        label: s.code,
        hint: `${s.brand} ${s.productLine} · ${s.colorName}`,
        keywords: `${s.material} ${s.location ?? ''} ${SPOOL_STATUS_LABELS[s.status]} ${s.amsSlot ? `slot ${s.amsSlot}` : ''} ${s.tags.join(' ')}`,
        run: go(`/spools/${s.id}`),
      }));
    const projects: Item[] = (data?.projects ?? []).map((p) => ({
      id: `pr-${p.id}`,
      group: 'Projets',
      label: p.name,
      hint: p.code ? `[${p.code}]` : undefined,
      keywords: p.tags.join(' '),
      run: go(`/projects/${p.id}`),
    }));
    const prints: Item[] = (data?.prints ?? []).map((p) => ({
      id: `i-${p.id}`,
      group: 'Impressions',
      label: p.name,
      hint: p.date ?? undefined,
      run: go('/prints'),
    }));
    return [...actions, ...pages, ...spools, ...projects, ...prints];
  }, [data, navigate]);

  const results = searchPalette(query, items, query ? 40 : 30);
  const cur = Math.min(active, Math.max(0, results.length - 1));
  const choose = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    it.run();
  };
  const optId = (i: number) => `${uid}-opt-${i}`;
  useEffect(() => {
    document.getElementById(optId(cur))?.scrollIntoView({ block: 'nearest' });
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className="bg-background fixed top-[10vh] left-1/2 z-50 flex max-h-[75vh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Palette de commandes</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-activedescendant={results.length ? optId(cur) : undefined}
              aria-label="Rechercher une page, une action, une bobine, un projet…"
              placeholder="Page, action, bobine, projet, impression…"
              className="h-12 flex-1 bg-transparent text-base outline-none"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive(Math.min(cur + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive(Math.max(cur - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  choose(results[cur]);
                }
              }}
            />
            <kbd className="text-muted-foreground hidden rounded border px-1.5 text-xs sm:inline">Échap</kbd>
          </div>
          <ul
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            aria-label="Résultats"
            className="overflow-y-auto p-1"
          >
            {results.map((it, i) => (
              <li
                key={it.id}
                id={optId(i)}
                role="option"
                aria-selected={i === cur}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
                  i === cur && 'bg-accent',
                )}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(it)}
              >
                <span className="font-medium">{it.label}</span>
                {it.hint && <span className="text-muted-foreground truncate">{it.hint}</span>}
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">{it.group}</span>
              </li>
            ))}
            {results.length === 0 && (
              <li className="text-muted-foreground p-4 text-center text-sm">Aucun résultat.</li>
            )}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

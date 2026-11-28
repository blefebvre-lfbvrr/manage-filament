import { Box as BoxIcon, Printer, QrCode } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useLocalState, useSpools } from '@/app/hooks';
import { downloadBlob } from '@/app/download';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import {
  customSheet,
  LABEL_SHEETS,
  layoutLabels,
  qrPath,
  sheetProblems,
  spoolUrl,
  type LabelSheet,
} from '@/lib/labels';
import type { Spool } from '@/lib/schemas';
import { safeFileName } from '@/lib/cloud/sync';
import { boxesToStl, plaqueBoxes } from '@/lib/stl';
import { SpoolSelect } from '../inventory/SpoolSelect';

interface LabelPrefs {
  sheetId: string;
  custom: {
    labelW: number;
    labelH: number;
    cols: number;
    rows: number;
    marginTop: number;
    marginLeft: number;
    gapX: number;
    gapY: number;
  };
  showProduct: boolean;
  showSwatch: boolean;
  showLocation: boolean;
}

const DEFAULT_PREFS: LabelPrefs = {
  sheetId: 'a4-3x8',
  custom: { labelW: 50, labelH: 30, cols: 0, rows: 0, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  showProduct: true,
  showSwatch: true,
  showLocation: false,
};

const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function LabelsPage() {
  const spools = (useSpools() ?? []).filter((s) => s.status !== 'archived');
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string[]>(
    () => params.get('ids')?.split(',').filter(Boolean) ?? [],
  );
  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = useLocalState<LabelPrefs>('labels.prefs', DEFAULT_PREFS);
  const p = { ...DEFAULT_PREFS, ...prefs, custom: { ...DEFAULT_PREFS.custom, ...prefs.custom } };
  const [skip, setSkip] = useState('0');
  const [copies, setCopies] = useState('1');
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  const sheet: LabelSheet =
    p.sheetId === 'custom'
      ? customSheet(p.custom)
      : (LABEL_SHEETS.find((s) => s.id === p.sheetId) ?? LABEL_SHEETS[0]!);
  const problems = sheetProblems(sheet);
  const chosen = spools
    .filter((s) => selected.includes(s.id))
    .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  const layout = layoutLabels(chosen, sheet, num(skip), num(copies) || 1);
  const appUrl = `${location.origin}${location.pathname}`;
  const q = query.trim().toLowerCase();
  const visible = spools
    .filter(
      (s) => !q || `${s.code} ${s.productLine} ${s.colorName} ${s.location ?? ''}`.toLowerCase().includes(q),
    )
    .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  const toggle = (sid: string, on: boolean) =>
    setSelected((x) => (on ? [...new Set([...x, sid])] : x.filter((y) => y !== sid)));
  const setCustom = (k: keyof LabelPrefs['custom'], v: string) =>
    setPrefs({ ...p, custom: { ...p.custom, [k]: num(v) } });

  return (
    <>
      <style>{`@media print {
        @page { size: ${sheet.pageW}mm ${sheet.pageH}mm; margin: 0; }
        html, body { background: #fff !important; }
        #main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
      }`}</style>
      <div className="print:hidden">
        <PageHeader
          title="Étiquettes"
          description="QR codes à coller sur les bobines : un scan avec le téléphone ouvre directement la fiche de la bobine."
          actions={
            <Button disabled={!chosen.length || problems.length > 0} onClick={() => window.print()}>
              <Printer aria-hidden /> Imprimer ({layout.labels.length})
            </Button>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Bobines</CardTitle>
              <CardDescription>{chosen.length} sélectionnée(s)</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Input
                type="search"
                aria-label="Filtrer les bobines"
                placeholder="Filtrer (code, couleur, lieu…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected([...new Set([...selected, ...visible.map((s) => s.id)])])}
                >
                  Tout cocher
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  Aucune
                </Button>
              </div>
              <ul className="max-h-96 overflow-y-auto rounded-md border p-1">
                {visible.map((s) => (
                  <li key={s.id}>
                    <label className="hover:bg-accent flex items-center gap-2 rounded px-2 py-1 text-sm">
                      <Checkbox
                        checked={selected.includes(s.id)}
                        onCheckedChange={(v) => toggle(s.id, v === true)}
                      />
                      <span className="font-medium">{s.code}</span>
                      <span className="text-muted-foreground truncate">
                        {s.productLine} {s.colorName}
                      </span>
                    </label>
                  </li>
                ))}
                {visible.length === 0 && (
                  <li className="text-muted-foreground p-2 text-sm">Aucune bobine.</li>
                )}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Format</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Planche" htmlFor={id('sheet')} className="sm:col-span-3">
                  <NativeSelect
                    id={id('sheet')}
                    value={p.sheetId}
                    onChange={(e) => setPrefs({ ...p, sheetId: e.target.value })}
                  >
                    {LABEL_SHEETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                    <option value="custom">Personnalisé…</option>
                  </NativeSelect>
                </Field>
                {p.sheetId === 'custom' &&
                  (
                    [
                      ['labelW', 'Largeur étiquette (mm)'],
                      ['labelH', 'Hauteur étiquette (mm)'],
                      ['cols', 'Colonnes (0 = étiquette seule)'],
                      ['rows', 'Lignes (0 = étiquette seule)'],
                      ['marginTop', 'Marge haute (mm)'],
                      ['marginLeft', 'Marge gauche (mm)'],
                      ['gapX', 'Espace horizontal (mm)'],
                      ['gapY', 'Espace vertical (mm)'],
                    ] as const
                  ).map(([k, label]) => (
                    <Field key={k} label={label} htmlFor={id(k)}>
                      <Input
                        id={id(k)}
                        inputMode="decimal"
                        defaultValue={String(p.custom[k])}
                        onChange={(e) => setCustom(k, e.target.value)}
                      />
                    </Field>
                  ))}
                <Field
                  label="Emplacements déjà utilisés"
                  htmlFor={id('skip')}
                  hint="Pour finir une planche entamée"
                >
                  <Input
                    id={id('skip')}
                    inputMode="numeric"
                    value={skip}
                    onChange={(e) => setSkip(e.target.value)}
                  />
                </Field>
                <Field label="Exemplaires par bobine" htmlFor={id('copies')}>
                  <Input
                    id={id('copies')}
                    inputMode="numeric"
                    value={copies}
                    onChange={(e) => setCopies(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ['showProduct', 'Gamme et couleur'],
                    ['showSwatch', 'Pastille de couleur'],
                    ['showLocation', 'Emplacement'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2">
                    <Checkbox checked={p[k]} onCheckedChange={(v) => setPrefs({ ...p, [k]: v === true })} />{' '}
                    {label}
                  </label>
                ))}
              </div>
              {problems.map((m) => (
                <p key={m} role="alert" className="text-danger-foreground text-sm">
                  {m}
                </p>
              ))}
              <p className="text-muted-foreground text-sm">
                {layout.pages} page(s). À l’impression, choisis l’échelle « 100 % » (ou « Taille réelle ») et
                désactive les en-têtes et pieds de page.
              </p>
            </CardContent>
          </Card>
        </div>
        <h2 className="mt-6 mb-2 text-lg font-semibold">Aperçu</h2>
        {layout.labels.length === 0 && (
          <p className="text-muted-foreground mb-4 text-sm">
            <QrCode className="mr-1 inline size-4" aria-hidden /> Coche des bobines pour voir l’aperçu.
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-4 print:block print:gap-0">
        {Array.from({ length: layout.pages }, (_, page) => (
          <div
            key={page}
            aria-label={`Page ${page + 1}`}
            className="relative w-full overflow-hidden bg-white text-black shadow-md print:shadow-none"
            style={{
              maxWidth: `${sheet.pageW}mm`,
              aspectRatio: `${sheet.pageW} / ${sheet.pageH}`,
              breakAfter: page < layout.pages - 1 ? 'page' : 'auto',
            }}
          >
            {layout.labels
              .filter((l) => l.page === page)
              .map((l, i) => (
                <SpoolLabel
                  key={`${l.item.id}-${i}`}
                  spool={l.item}
                  url={spoolUrl(l.item.id, appUrl)}
                  prefs={p}
                  style={{
                    left: `${(l.x / sheet.pageW) * 100}%`,
                    top: `${(l.y / sheet.pageH) * 100}%`,
                    width: `${(sheet.labelW / sheet.pageW) * 100}%`,
                    height: `${(sheet.labelH / sheet.pageH) * 100}%`,
                  }}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="print:hidden">
        <PlaqueSection spools={spools} initial={chosen[0]?.id ?? null} />
      </div>
    </>
  );
}

function SpoolLabel({
  spool,
  url,
  prefs,
  style,
}: {
  spool: Spool;
  url: string;
  prefs: LabelPrefs;
  style: React.CSSProperties;
}) {
  const qr = useMemo(() => qrPath(url), [url]);
  return (
    <div
      className="absolute overflow-hidden border border-dashed border-gray-300 print:border-0"
      style={{ ...style, containerType: 'size' }}
    >
      <div className="flex size-full items-center gap-[4cqh] p-[6cqh]">
        <svg
          viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`}
          className="h-full shrink-0"
          role="img"
          aria-label={`QR code ${spool.code}`}
        >
          <rect x={-1} y={-1} width={qr.size + 2} height={qr.size + 2} fill="#fff" />
          <path d={qr.d} fill="#000" shapeRendering="crispEdges" />
        </svg>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[3cqh] leading-tight">
          <span className="truncate font-bold" style={{ fontSize: 'min(22cqh, 7.5cqw)' }}>
            {spool.code}
          </span>
          {prefs.showProduct && (
            <span className="line-clamp-2" style={{ fontSize: 'min(12cqh, 5cqw)' }}>
              {spool.productLine} · {spool.colorName}
            </span>
          )}
          {prefs.showLocation && spool.location && (
            <span className="truncate" style={{ fontSize: 'min(10cqh, 4.5cqw)' }}>
              {spool.location}
            </span>
          )}
          {prefs.showSwatch && spool.colorHex && (
            <span
              className="block w-full rounded-sm border border-black/30"
              style={{
                height: '12cqh',
                backgroundColor: spool.colorHex,
                printColorAdjust: 'exact',
                WebkitPrintColorAdjust: 'exact',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PlaqueSection({ spools, initial }: { spools: Spool[]; initial: string | null }) {
  const [spoolId, setSpoolId] = useState<string | null>(initial);
  const spool = spools.find((s) => s.id === spoolId);
  const [line1, setLine1] = useState<string | null>(null);
  const [line2, setLine2] = useState<string | null>(null);
  const [charH, setCharH] = useState('6');
  const [minW, setMinW] = useState('50');
  const uid = useId();
  const l1 = line1 ?? spool?.code ?? '';
  const l2 = line2 ?? (spool ? `${spool.material} ${spool.colorName}` : '');
  const plaque = plaqueBoxes({
    lines: [l1, l2],
    charHeightMm: Math.max(2, num(charH)),
    minWidthMm: num(minW),
  });
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BoxIcon className="size-5" aria-hidden /> Plaquette à imprimer en 3D (.stl)
        </CardTitle>
        <CardDescription>
          Socle de 1,2 mm et texte en relief de 0,8 mm. Pour un texte d’une autre couleur, ajoute un
          changement de filament à 1,2 mm dans le trancheur (ou peins le relief avec l’AMS).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Bobine" htmlFor={`${uid}-spool`}>
            <SpoolSelect
              id={`${uid}-spool`}
              spools={spools}
              value={spoolId}
              onChange={(v) => {
                setSpoolId(v);
                setLine1(null);
                setLine2(null);
              }}
              label="Bobine de la plaquette"
            />
          </Field>
          <Field label="Ligne 1" htmlFor={`${uid}-l1`}>
            <Input id={`${uid}-l1`} value={l1} onChange={(e) => setLine1(e.target.value)} />
          </Field>
          <Field
            label="Ligne 2"
            htmlFor={`${uid}-l2`}
            hint="Majuscules sans accents ; caractères spéciaux remplacés par des espaces"
          >
            <Input id={`${uid}-l2`} value={l2} onChange={(e) => setLine2(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hauteur des lettres (mm)" htmlFor={`${uid}-ch`}>
              <Input
                id={`${uid}-ch`}
                inputMode="decimal"
                value={charH}
                onChange={(e) => setCharH(e.target.value)}
              />
            </Field>
            <Field label="Largeur minimale (mm)" htmlFor={`${uid}-mw`}>
              <Input
                id={`${uid}-mw`}
                inputMode="decimal"
                value={minW}
                onChange={(e) => setMinW(e.target.value)}
              />
            </Field>
          </div>
          <Button
            className="self-start"
            disabled={!l1.trim() && !l2.trim()}
            onClick={() => {
              downloadBlob(
                new Blob([boxesToStl(plaque.boxes, `FilaTrack ${l1}`)], { type: 'model/stl' }),
                `plaquette-${safeFileName(l1 || 'filatrack')}.stl`,
              );
              toast.success('Plaquette téléchargée.');
            }}
          >
            Télécharger le .stl
          </Button>
        </div>
        <figure className="flex flex-col gap-2">
          <svg
            viewBox={`0 0 ${plaque.widthMm} ${plaque.depthMm}`}
            className="w-full rounded-md border"
            role="img"
            aria-label={`Aperçu de la plaquette ${plaque.widthMm} × ${plaque.depthMm} mm`}
          >
            <rect width={plaque.widthMm} height={plaque.depthMm} fill={spool?.colorHex ?? '#d4d4d4'} />
            {plaque.boxes.slice(1).map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={plaque.depthMm - b.y - b.d}
                width={b.w}
                height={b.d}
                fill={contrast(spool?.colorHex)}
              />
            ))}
          </svg>
          <figcaption className="text-muted-foreground text-sm">
            {plaque.widthMm} × {plaque.depthMm} × {plaque.heightMm} mm
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}

function contrast(hex?: string | null): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return '#111';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? '#111' : '#fff';
}

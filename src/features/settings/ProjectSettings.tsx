import { useSettings } from '@/app/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { saveSettings } from '@/db/repo';
import type { AppSettings } from '@/lib/schemas';

type P = AppSettings['projects'];
const FIELDS: [keyof P, string, string?][] = [
  ['safetyMarginPct', 'Marge de sécurité (%)', 'Ajoutée au besoin en filament'],
  ['failMarginPct', 'Marge pour les ratés (%)'],
  ['machineHourlyRate', 'Coût machine (€/h)', 'Usure, buses, plateau'],
  ['laborHourlyRate', 'Taux horaire main-d’œuvre (€/h)'],
  ['defaultMarginPct', 'Marge par défaut (%)', 'Pour le prix suggéré'],
  ['roundTo', 'Arrondi du prix (€)', 'Ex. 0,5 → prix arrondi aux 50 centimes'],
  ['printHoursPerDay', 'Heures d’impression par jour', 'Pour la date de fin estimée'],
];

export function ProjectSettings() {
  const settings = useSettings();
  const p = settings.projects;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Projets : marges, coûts et prix</CardTitle>
        <CardDescription>
          Utilisés par l’analyse de faisabilité, les coûts et le prix suggéré des projets.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4">
        {FIELDS.map(([key, label, hint]) => (
          <Field key={key} label={label} htmlFor={`proj-${key}`} hint={hint}>
            <Input
              id={`proj-${key}`}
              inputMode="decimal"
              defaultValue={p[key]}
              key={`${key}${p[key]}`}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(',', '.'));
                if (Number.isFinite(v) && v >= 0 && v !== p[key])
                  void saveSettings({
                    projects: { ...p, [key]: key === 'printHoursPerDay' ? Math.min(24, Math.max(1, v)) : v },
                  });
              }}
            />
          </Field>
        ))}
      </CardContent>
    </Card>
  );
}

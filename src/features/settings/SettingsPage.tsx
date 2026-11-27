import { FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSettings } from '@/app/hooks';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getDataMode, setDataMode } from '@/db/db';
import { saveSettings } from '@/db/repo';
import type { AppSettings } from '@/lib/schemas';

const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'CAD'];
const DATE_FORMATS = ['dd/MM/yyyy', 'dd/MM/yy', 'd MMM yyyy', 'yyyy-MM-dd'];

export function SettingsPage() {
  const settings = useSettings();
  const [draft, setDraft] = useState(settings);
  const demo = getDataMode() === 'demo';
  useEffect(() => setDraft(settings), [settings]);

  const save = async (patch: Partial<AppSettings>) => {
    try {
      await saveSettings(patch);
      toast.success('Paramètres enregistrés.');
    } catch {
      toast.error('Valeur invalide.');
    }
  };
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  return (
    <>
      <PageHeader title="Paramètres" description="Réglages enregistrés sur cet appareil." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seuils de stock</CardTitle>
            <CardDescription>
              Mêmes règles que ton Excel : OK → Bientôt vide → À changer → Vide. Modifiables bobine par
              bobine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const low = num(String(draft.lowThresholdG));
                const crit = num(String(draft.criticalThresholdG));
                if (low === null || crit === null || Number.isNaN(low) || Number.isNaN(crit) || crit > low) {
                  toast.error(
                    'Le seuil « à changer » doit être inférieur ou égal au seuil « bientôt vide ».',
                  );
                  return;
                }
                void save({
                  lowThresholdG: low,
                  criticalThresholdG: crit,
                  nextPrintG: num(String(draft.nextPrintG ?? '')),
                });
              }}
            >
              <Field label="Bientôt vide (g)" htmlFor="low">
                <Input
                  id="low"
                  inputMode="decimal"
                  value={String(draft.lowThresholdG)}
                  onChange={(e) => setDraft({ ...draft, lowThresholdG: e.target.value as unknown as number })}
                />
              </Field>
              <Field label="À changer (g)" htmlFor="crit">
                <Input
                  id="crit"
                  inputMode="decimal"
                  value={String(draft.criticalThresholdG)}
                  onChange={(e) =>
                    setDraft({ ...draft, criticalThresholdG: e.target.value as unknown as number })
                  }
                />
              </Field>
              <Field
                label="Prochaine impression (g)"
                htmlFor="next"
                hint="Repris de l’Excel ; utilisé en phase 4"
              >
                <Input
                  id="next"
                  inputMode="decimal"
                  value={draft.nextPrintG == null ? '' : String(draft.nextPrintG)}
                  onChange={(e) => setDraft({ ...draft, nextPrintG: e.target.value as unknown as number })}
                />
              </Field>
              <Button type="submit" className="sm:col-span-3 sm:justify-self-start">
                Enregistrer les seuils
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Affichage</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Thème" htmlFor="theme">
              <NativeSelect
                id="theme"
                value={settings.theme}
                onChange={(e) => void save({ theme: e.target.value as AppSettings['theme'] })}
              >
                <option value="system">Système</option>
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
              </NativeSelect>
            </Field>
            <Field label="Devise" htmlFor="currency">
              <NativeSelect
                id="currency"
                value={settings.currency}
                onChange={(e) => void save({ currency: e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Format de date" htmlFor="datefmt">
              <NativeSelect
                id="datefmt"
                value={settings.dateFormat}
                onChange={(e) => void save({ dateFormat: e.target.value })}
              >
                {DATE_FORMATS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Unité de poids" htmlFor="unit">
              <NativeSelect
                id="unit"
                value={settings.weightUnit}
                onChange={(e) => void save({ weightUnit: e.target.value as 'g' | 'kg' })}
              >
                <option value="g">Grammes</option>
                <option value="kg">Kilogrammes</option>
              </NativeSelect>
            </Field>
            <Field label="Diamètre par défaut" htmlFor="diam">
              <NativeSelect
                id="diam"
                value={String(settings.defaultDiameterMm)}
                onChange={(e) => void save({ defaultDiameterMm: Number(e.target.value) })}
              >
                <option value="1.75">1,75 mm</option>
                <option value="2.85">2,85 mm</option>
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Électricité</CardTitle>
            <CardDescription>
              Ajoute au coût de chaque impression : puissance moyenne × durée × prix du kWh.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 sm:col-span-3">
              <Switch
                id="elec"
                checked={settings.electricity.enabled}
                onCheckedChange={(v) => void save({ electricity: { ...settings.electricity, enabled: v } })}
              />
              <Label htmlFor="elec">Inclure le coût électrique</Label>
            </div>
            <Field label="Puissance moyenne (W)" htmlFor="watts" hint="A1 : ~95 W en moyenne">
              <Input
                id="watts"
                inputMode="decimal"
                defaultValue={settings.electricity.avgPowerW}
                key={`w${settings.electricity.avgPowerW}`}
                onBlur={(e) => {
                  const v = num(e.target.value);
                  if (v !== null && !Number.isNaN(v))
                    void save({ electricity: { ...settings.electricity, avgPowerW: v } });
                }}
              />
            </Field>
            <Field label="Prix du kWh" htmlFor="kwh">
              <Input
                id="kwh"
                inputMode="decimal"
                defaultValue={settings.electricity.pricePerKwh}
                key={`k${settings.electricity.pricePerKwh}`}
                onBlur={(e) => {
                  const v = num(e.target.value);
                  if (v !== null && !Number.isNaN(v))
                    void save({ electricity: { ...settings.electricity, pricePerKwh: v } });
                }}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prévisions</CardTitle>
            <CardDescription>
              La date de rupture d’une bobine est estimée d’après sa consommation moyenne récente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Fenêtre de calcul (jours)" htmlFor="fcw">
              <Input
                id="fcw"
                type="number"
                min={7}
                max={365}
                defaultValue={settings.forecastWindowDays}
                key={`f${settings.forecastWindowDays}`}
                onBlur={(e) => {
                  const v = Math.max(7, Math.min(365, Math.floor(Number(e.target.value) || 60)));
                  void save({ forecastWindowDays: v });
                }}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sauvegarde</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Rappel de sauvegarde (jours, 0 = jamais)" htmlFor="reminder">
              <Input
                id="reminder"
                type="number"
                min={0}
                defaultValue={settings.backupReminderDays}
                key={`r${settings.backupReminderDays}`}
                onBlur={(e) => {
                  const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  void save({ backupReminderDays: v });
                }}
              />
            </Field>
          </CardContent>
        </Card>

        <Card id="demo" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4" aria-hidden /> Données de démonstration
            </CardTitle>
            <CardDescription>
              La démo utilise une base séparée : tes vraies données ne sont ni lues ni modifiées. Tu peux
              revenir à tes données à tout moment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Switch
              id="demo-switch"
              checked={demo}
              onCheckedChange={(v) => {
                setDataMode(v ? 'demo' : 'real');
                window.location.reload();
              }}
            />
            <Label htmlFor="demo-switch">{demo ? 'Mode démo activé' : 'Utiliser les données de démo'}</Label>
          </CardContent>
        </Card>
      </div>
      <p className="text-muted-foreground mt-6 text-xs">
        FilaTrack {__APP_VERSION__} — aucune donnée n’est envoyée à un serveur.
      </p>
    </>
  );
}

import { expect, test, type Page } from '@playwright/test';
import { sliced3mf } from '../../src/test/fixtures';

async function demo(page: Page, path = './') {
  await page.addInitScript(() => localStorage.setItem('filatrack:mode', 'demo'));
  await page.goto(path);
}

async function remainingOf(page: Page, code: string): Promise<number> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Tableau' }).click();
  await page.getByRole('link', { name: code, exact: true }).click();
  await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible();
  const v = await page.getByRole('meter', { name: 'Restant' }).first().getAttribute('aria-valuetext');
  return Number(
    v!
      .replace(/\s/g, '')
      .replace(',', '.')
      .match(/^-?[\d.]+/)![0],
  );
}

test.describe('Phase 2 — consommation', () => {
  test('import .3mf : rattachement automatique, déduction puis annulation', async ({ page }) => {
    await demo(page);
    const before = await remainingOf(page, 'PLA-001');
    await page.goto('./#/prints');
    await page.getByRole('button', { name: 'Importer .3mf / .gcode' }).click();
    await page
      .getByLabel('Fichier .3mf ou .gcode')
      .setInputFiles({ name: 'boites.gcode.3mf', mimeType: 'model/3mf', buffer: Buffer.from(sliced3mf()) });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Bambu Studio 02.03.00.70')).toBeVisible();
    await expect(dialog.getByText(/rattaché à PLA-001 \(.*même couleur.*slot AMS 1/)).toBeVisible();
    await expect(dialog.getByText(/rattaché à PLA-003/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Enregistrer et déduire' }).click();
    await expect(page.getByText('1 impression(s) enregistrée(s), 56,3 g déduits.')).toBeVisible();
    await expect(page.getByText('boites', { exact: true })).toBeVisible();
    expect(await remainingOf(page, 'PLA-001')).toBeCloseTo(before - 42.1, 1);

    await page.goto('./#/prints');
    await page.getByRole('button', { name: 'Actions pour boites' }).click();
    await page.getByRole('menuitem', { name: 'Annuler la déduction' }).click();
    await expect(page.getByText('Déduction annulée')).toBeVisible();
    await expect(page.getByText('Non déduite')).toBeVisible();
    expect(await remainingOf(page, 'PLA-001')).toBeCloseTo(before, 1);
  });

  test('saisie manuelle : impression ratée à 50 %', async ({ page }) => {
    await demo(page, './#/prints');
    await page.getByRole('button', { name: 'Nouvelle impression' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nom').fill('Vase raté');
    await dialog.getByLabel('Résultat', { exact: true }).selectOption('failed');
    await dialog.getByLabel('Ratée à (%)').fill('50');
    await dialog.getByRole('button', { name: 'Ajouter un filament' }).click();
    await dialog.getByLabel('Bobine du filament 1').selectOption({ index: 2 });
    await dialog.getByLabel('Prévu (g)').fill('120');
    await expect(dialog.getByText('Déduit : 60 g')).toBeVisible();
    await dialog.getByRole('button', { name: 'Enregistrer et déduire 60 g' }).click();
    await expect(page.getByText('« Vase raté » enregistrée : 60 g déduits du stock.')).toBeVisible();
    await expect(page.getByText('Ratée à 50 %')).toBeVisible();
  });

  test('file d’attente : lancer une impression planifiée', async ({ page }) => {
    await demo(page, './#/prints');
    await page.getByRole('tab', { name: /À imprimer/ }).click();
    await page.getByRole('button', { name: 'Imprimer' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /^Imprimer « / })).toBeVisible();
    await dialog.getByRole('button', { name: 'Ajouter un filament' }).click();
    await dialog.getByLabel('Bobine du filament 1').selectOption({ index: 2 });
    await dialog.getByLabel('Grammes').fill('25');
    await dialog.getByRole('button', { name: 'Enregistrer et déduire 25 g' }).click();
    await expect(page.getByText(/25 g déduits du stock/)).toBeVisible();
  });

  test('mode pesée : brut − tare', async ({ page }) => {
    await demo(page, './#/weigh');
    await page.getByRole('button', { name: /^PLA-002/ }).click();
    await page.getByLabel('Poids brut sur la balance (g)').fill('600');
    await page.getByLabel('Tare bobine vide (g)').fill('250');
    await expect(page.getByText('350 g', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enregistrer la pesée' }).click();
    await expect(page.getByText(/PLA-002 : 350 g restants/)).toBeVisible();
    await expect(page.getByText(/600 g − 250 g/)).toBeVisible();
    await page.goto('./#/journal');
    await page.getByLabel('Type de mouvement').selectOption('weighing');
    await expect(page.getByRole('cell', { name: /Pesée : 600 g brut/ })).toBeVisible();
  });

  test('AMS : placer une bobine dans un slot', async ({ page }) => {
    await demo(page, './#/ams');
    await expect(page.getByRole('group', { name: /Slot 2 : PLA-002/ })).toBeVisible();
    await page.getByRole('button', { name: 'Placer PLA-004' }).click();
    await page.getByRole('menuitem', { name: /Slot 2/ }).click();
    await expect(page.getByText('PLA-004 → Slot 2.')).toBeVisible();
    await expect(page.getByRole('group', { name: /Slot 2 : PLA-004/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Placer PLA-002' })).toBeVisible();
  });
});

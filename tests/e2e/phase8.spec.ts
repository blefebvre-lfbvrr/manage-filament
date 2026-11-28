import { expect, test } from '@playwright/test';

test.describe('Personnalisation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('filatrack:mode', 'demo'));
  });

  test('palette Ctrl+K : bobine et action', async ({ page }) => {
    await page.goto('./#/');
    await expect(page.getByRole('heading', { name: 'Inventaire' })).toBeVisible();
    await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: /Rechercher une page/ });
    await input.fill('petg sarcelle');
    await expect(page.getByRole('option')).toHaveCount(1);
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: 'PETG-002' })).toBeVisible();

    await page.getByRole('button', { name: 'Rechercher (Ctrl+K)' }).first().click();
    await input.fill('nouvelle impression');
    await input.press('Enter');
    await expect(page.getByRole('dialog', { name: /Nouvelle impression|impression/i })).toBeVisible();
  });

  test('champ personnalisé et vue enregistrée', async ({ page }) => {
    await page.goto('./#/settings');
    const spoolFields = page.getByRole('region', { name: 'Champs des bobines' });
    await spoolFields.getByRole('button', { name: 'Ajouter un champ' }).click();
    await spoolFields.getByLabel('Libellé').fill('Lot');
    await spoolFields.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('Champ enregistré.')).toBeVisible();
    await expect(spoolFields.getByText('Lot', { exact: true })).toBeVisible();

    await page.goto('./#/');
    await page.getByRole('searchbox').first().fill('PETG');
    await page.getByRole('button', { name: 'Vues' }).click();
    await page.getByRole('menuitem', { name: 'Enregistrer la vue actuelle…' }).click();
    await page.getByLabel('Nom de la vue').fill('Mes PETG');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByText('Vue « Mes PETG » enregistrée.')).toBeVisible();
    await page.getByRole('searchbox').first().fill('');
    await page.getByRole('button', { name: 'Vues' }).click();
    await page.getByRole('menuitem', { name: 'Mes PETG' }).click();
    await expect(page.getByRole('searchbox').first()).toHaveValue('PETG');
  });
});

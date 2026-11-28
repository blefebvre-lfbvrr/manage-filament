import { expect, test } from '@playwright/test';

test.describe('Boîte de réception Bambu', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('filatrack:mode', 'demo'));
  });

  test('valider, échec au prorata, ignorer', async ({ page }) => {
    await page.goto('./#/inbox');
    await expect(page.getByRole('heading', { name: 'À valider' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'À valider (3)' })).toBeVisible();

    const ok = page.getByRole('region', { name: 'Support casque v2' });
    await ok.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByText('« Support casque v2 » validée : stock mis à jour.')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'À valider (2)' })).toBeVisible();

    const gift = page.getByRole('region', { name: '[CADEAU] Pot à crayons' });
    await expect(gift.getByText(/Rattaché automatiquement/)).toBeVisible();

    const failed = page.getByRole('region', { name: 'Engrenage PETG' });
    await failed.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByText(/Indique l’avancement/)).toBeVisible();
    await failed.getByLabel('Avancement à l’arrêt (%)').fill('50');
    await failed.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByText('« Engrenage PETG » validée : stock mis à jour.')).toBeVisible();

    await gift.getByRole('button', { name: 'Ignorer' }).click();
    await expect(page.getByText('Rien à valider.')).toBeVisible();
    await page.getByRole('tab', { name: 'Validées (2)' }).click();
    await expect(page.getByText('voir dans les impressions')).toHaveCount(2);

    await page.getByText('voir dans les impressions').first().click();
    await expect(page.getByRole('heading', { name: 'Impressions', exact: true })).toBeVisible();
    await expect(page.getByText('Engrenage PETG').first()).toBeVisible();
  });
});

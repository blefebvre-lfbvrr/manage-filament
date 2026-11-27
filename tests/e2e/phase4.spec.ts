import { expect, test } from '@playwright/test';

test.describe('Phase 4 — alertes, séchage, liste de courses', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('filatrack:mode', 'demo'));
  });

  test('centre de notifications : badge, lecture', async ({ page }) => {
    await page.goto('./#/alerts');
    const bell = page.getByRole('button', { name: /^Notifications : \d+ non lue/ }).first();
    await expect(bell).toBeVisible();
    await expect(page.getByRole('link', { name: 'PLA-010 à changer' })).toBeVisible();
    await page.getByRole('button', { name: 'Tout marquer comme lu' }).click();
    await expect(page.getByRole('button', { name: 'Notifications', exact: true }).first()).toBeVisible();
  });

  test('règle de stock minimum → alerte et suggestion d’achat', async ({ page }) => {
    await page.goto('./#/alerts');
    await page.getByRole('button', { name: 'Règle' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Gamme + couleur').fill('PLA Basic|Noir');
    await dialog.getByLabel('Bobines minimum').fill('3');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Sous le minimum')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stock minimum : PLA Basic Noir' })).toBeVisible();
    await page.goto('./#/shopping');
    await expect(page.getByText('1 × Bambu Lab PLA Basic Noir')).toBeVisible();
  });

  test('séchage : « Séchée aujourd’hui » retire le rappel', async ({ page }) => {
    await page.goto('./#/alerts');
    const row = page.getByRole('listitem').filter({ hasText: 'TPU-001 TPU 95A HF' });
    await row.getByRole('button', { name: 'Séchée aujourd’hui' }).click();
    await expect(page.getByText('TPU-001 : séchage enregistré.')).toBeVisible();
    await expect(page.getByText('Séchage conseillé : TPU-001')).toBeHidden();
  });

  test('liste de courses : ajouter puis « Acheté » crée les bobines', async ({ page }) => {
    await page.goto('./#/shopping');
    await page
      .getByRole('button', { name: 'Ajouter Bambu Lab PLA Basic Orange citrouille à la liste' })
      .click();
    await expect(page.getByText('Ma liste (1)')).toBeVisible();
    await expect(page.getByText('25,99 €').first()).toBeVisible();
    await page.getByLabel('Quantité de Bambu Lab PLA Basic Orange citrouille').fill('2');
    await page.getByLabel('Quantité de Bambu Lab PLA Basic Orange citrouille').blur();
    await page.getByRole('button', { name: /^Acheté : ajouter 2 × / }).click();
    await expect(page.getByText(/2 bobine\(s\) ajoutée\(s\) au stock/)).toBeVisible();
    await expect(page.getByText('Achetés récemment')).toBeVisible();
    // La bobine vide n'est plus suggérée : une rechange neuve existe.
    await expect(page.getByText('PLA-009 vide')).toBeHidden();
  });
});

import { expect, test } from '@playwright/test';
import QRCode from 'qrcode';

test.describe('Étiquettes et scan', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('filatrack:mode', 'demo'));
  });

  test('étiquette depuis la fiche, aperçu et plaquette STL', async ({ page }) => {
    await page.goto('./#/spools/demo-spool-1');
    await page.getByRole('link', { name: 'Étiquette', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Étiquettes' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code PLA-001' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimer (1)' })).toBeEnabled();
    await page.getByLabel('Exemplaires par bobine').fill('3');
    await expect(page.getByRole('img', { name: 'QR code PLA-001' })).toHaveCount(3);

    await page.getByLabel('Ligne 1').fill('PLA-001');
    await expect(page.getByRole('img', { name: /Aperçu de la plaquette/ })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le .stl' }).click();
    expect((await download).suggestedFilename()).toBe('plaquette-PLA-001.stl');
  });

  test('scan d’une photo d’étiquette puis action rapide', async ({ page }) => {
    await page.goto('./#/scan');
    const png = await QRCode.toBuffer('https://exemple.test/manage-filament/#/spools/demo-spool-6', {
      margin: 4,
      width: 400,
    });
    await page.getByLabel('Photo d’une étiquette').setInputFiles({
      name: 'etiquette.png',
      mimeType: 'image/png',
      buffer: png,
    });
    const card = page.getByRole('region', { name: 'Bobine PLA-005' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Slot 2' }).click();
    await expect(page.getByText('Placée dans le slot 2.')).toBeVisible();

    await page.getByLabel('Code de la bobine').fill('petg1');
    await page.getByRole('button', { name: 'Ouvrir' }).click();
    await expect(page.getByRole('region', { name: 'Bobine PETG-001' })).toBeVisible();
  });
});

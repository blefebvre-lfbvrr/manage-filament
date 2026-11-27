import { expect, test } from '@playwright/test';
import { legacyWorkbook } from '../../src/test/fixtures';

test.describe('FilaTrack', () => {
  test('ajout rapide depuis le catalogue (ajout multiple)', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Inventaire' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Gamme', { exact: true }).selectOption({ label: 'PLA Basic' });
    await dialog.getByLabel('Couleur du catalogue').selectOption({ label: 'Noir (10101)' });
    await expect(dialog.getByLabel('Prix (€)')).toHaveValue('25.99');
    await dialog.getByLabel('Quantité').fill('3');
    await dialog.getByRole('button', { name: 'Ajouter 3 bobines' }).click();
    await expect(page.getByText('3 bobines ajoutées')).toBeVisible();
    await page.getByRole('button', { name: 'Cartes' }).click();
    for (const code of ['PLA-001', 'PLA-002', 'PLA-003'])
      await expect(page.getByRole('link', { name: code })).toBeVisible();
  });

  test('import de l’Excel « Suivi filament » puis fiche bobine', async ({ page }) => {
    await page.goto('./#/data');
    await page.getByLabel('Fichier Excel à importer').setInputFiles({
      name: 'suivi.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(legacyWorkbook()),
    });
    await expect(page.getByRole('region', { name: 'Feuille Bobines' })).toBeVisible();
    await page.getByRole('button', { name: 'Vérifier l’import' }).click();
    await expect(page.getByText('4 nouvelles')).toBeVisible();
    await expect(page.getByText('B04 : restant négatif')).toBeVisible();
    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(page.getByText('4 bobine(s) créée(s)')).toBeVisible();
    await page.getByRole('link', { name: 'Voir l’inventaire' }).click();
    await page.getByRole('button', { name: 'Tableau' }).click();
    await page.getByRole('link', { name: 'B01', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'B01' })).toBeVisible();
    await expect(page.getByText('Support B').first()).toBeVisible();
    // Correction du restant puis annulation depuis le journal.
    await page.getByRole('button', { name: 'Corriger le restant' }).click();
    await page.getByLabel('Restant (g)').fill('650');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Restant corrigé (-50 g)')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).first().click();
    await expect(page.getByText('Mouvement annulé.')).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Restant' })).toHaveAttribute('aria-valuenow', '70');
  });

  test('mode démo isolé des vraies données', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByLabel('Utiliser les données de démo').click();
    await expect(page.getByText('Mode démo : données fictives')).toBeVisible();
    await page.getByRole('link', { name: 'Inventaire' }).first().click();
    await expect(page.getByText('14 bobines')).toBeVisible();
    await page.goto('./#/settings');
    await page.getByLabel('Mode démo activé').click();
    await expect(page.getByText('Mode démo : données fictives')).toBeHidden();
    await page.goto('./');
    await expect(page.getByText('Aucune bobine pour l’instant')).toBeVisible();
  });

  test('sauvegarde JSON téléchargeable', async ({ page }) => {
    await page.goto('./#/data');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Sauvegarder (JSON)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^filatrack-backup-.*\.json$/);
  });
});

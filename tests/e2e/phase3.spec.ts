import { expect, test } from '@playwright/test';

test.describe('Phase 3 — tableau de bord et projets', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('filatrack:mode', 'demo'));
  });

  test('indicateurs, graphiques, vue tableau et filtres', async ({ page }) => {
    await page.goto('./#/dashboard');
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    const kpis = page.getByRole('region', { name: 'Indicateurs clés' });
    await expect(kpis.getByText('Bobines en stock')).toBeVisible();
    await expect(kpis.getByText('7,66 kg')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stock par couleur' })).toBeVisible();
    // Vue tableau accessible d'un graphique.
    await page.getByRole('button', { name: 'Stock par matériau : afficher le tableau' }).click();
    await expect(
      page.getByRole('table', { name: 'Stock par matériau' }).getByRole('cell', { name: 'PETG' }),
    ).toBeVisible();
    // Filtre matériau : le stock se recalcule.
    await page.getByLabel('Matériau', { exact: true }).selectOption('TPU');
    await expect(kpis.getByText('0,85 kg')).toBeVisible();
    await expect(page.getByText('Prévision de rupture')).toBeVisible();
  });

  test('personnaliser : masquer un widget, disposition mémorisée', async ({ page }) => {
    await page.goto('./#/dashboard');
    await page.getByRole('button', { name: 'Personnaliser' }).click();
    await page.getByRole('dialog').getByRole('checkbox', { name: 'Dépenses par mois' }).click();
    await page.getByRole('button', { name: 'Monter Coût par projet' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    // La fenêtre se ferme une fois la transaction validée (l'affichage, lui, est optimiste).
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Dépenses par mois' })).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Coût par projet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dépenses par mois' })).toBeHidden();
  });

  test('projets : budget et création', async ({ page }) => {
    await page.goto('./#/projects');
    await expect(page.getByRole('meter', { name: 'Budget de Rangement atelier' })).toBeVisible();
    await page.getByRole('button', { name: 'Nouveau projet' }).click();
    await page.getByLabel('Nom').fill('Imprimante 2');
    await page.getByLabel('Budget (€, facultatif)').fill('25');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: 'Imprimante 2' })).toBeVisible();
    await expect(page.getByText('Budget 25,00 €')).toBeVisible();
  });

  test('coût électrique ajouté aux impressions', async ({ page }) => {
    const n = (s: string | null) => Number(s!.replace(/[^\d,]/g, '').replace(',', '.'));
    await page.goto('./#/prints');
    const material = page.getByText('Coût matière', { exact: true }).locator('..').locator('p').nth(1);
    await expect(material).not.toHaveText('0,00 €');
    const before = n(await material.textContent());
    await page.goto('./#/settings');
    await page.getByLabel('Inclure le coût électrique').click();
    await expect(page.getByText('Paramètres enregistrés.')).toBeVisible();
    await page.goto('./#/prints');
    const total = page.getByText('Coût (matière + élec.)', { exact: true }).locator('..').locator('p').nth(1);
    await expect.poll(async () => n(await total.textContent())).toBeGreaterThan(before);
  });
});

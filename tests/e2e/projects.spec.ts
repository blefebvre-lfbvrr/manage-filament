import { expect, test } from '@playwright/test';
import { sliced3mf } from '../../src/test/fixtures';

const file = (name: string) => ({ name, mimeType: 'model/3mf', buffer: Buffer.from(sliced3mf()) });

test.describe('Projets', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('filatrack:mode', 'demo'));
  });

  test('import .3mf dans un projet, faisabilité et réservation', async ({ page }) => {
    await page.goto('./#/projects');
    await page.getByRole('link', { name: 'Rangement atelier' }).click();
    await expect(page.getByRole('heading', { name: 'Rangement atelier' })).toBeVisible();
    await expect(page.getByText('Boîte à vis', { exact: true })).toBeVisible();
    await page.getByLabel('Fichiers .3mf à ajouter au projet').setInputFiles(file('boites.gcode.3mf'));
    await expect(page.getByText('boites.gcode.3mf : 1 plateau(x) ajouté(s).')).toBeVisible();
    const panel = page.getByRole('region', { name: 'PLA Basic Noir' });
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: 'Réserver les bobines' }).click();
    await expect(page.getByText(/bobine\(s\) réservée\(s\) pour ce projet/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bobines réservées' })).toBeVisible();
  });

  test('« Puis-je imprimer ça ? » : manque, commande ajoutée aux courses', async ({ page }) => {
    await page.goto('./#/feasibility');
    await page.getByLabel('Fichiers à analyser').setInputFiles(file('boites.gcode.3mf'));
    await page.getByLabel('Quantité de boites').fill('40');
    await expect(page.getByText('À commander').first()).toBeVisible();
    await expect(page.getByText(/Commander \d+ × Bambu Lab PLA Basic Noir/)).toBeVisible();
    await page.getByRole('button', { name: 'Tout ajouter aux courses' }).click();
    await expect(page.getByText('Commande ajoutée à la liste de courses.')).toBeVisible();
    await page.goto('./#/shopping');
    await expect(page.getByText(/Bambu Lab PLA Basic Noir/).first()).toBeVisible();
    await expect(page.getByText(/manquants/).first()).toBeVisible();
  });

  test('projet pour un tiers : contact, prix, devis', async ({ page }) => {
    await page.goto('./#/projects');
    await page.getByRole('button', { name: 'Nouveau projet' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Nom', { exact: true }).fill('Lampe de M. Martin');
    await d.getByLabel('Code (préfixe de fichier)').fill('martin');
    await d.getByRole('checkbox', { name: /Pour quelqu’un d’autre/ }).click();
    await d.getByLabel('Pour qui').selectOption({ label: '+ Nouveau contact…' });
    await d.getByLabel('Nom du contact').fill('M. Martin');
    await d.getByRole('button', { name: 'Créer le projet' }).click();
    await expect(page.getByRole('heading', { name: /Lampe de M. Martin/ })).toBeVisible();
    await expect(page.getByText('Pour M. Martin')).toBeVisible();
    await page.getByLabel('Prix final (€)').fill('42');
    await page.getByLabel('Prix final (€)').blur();
    await page.getByRole('link', { name: 'Devis' }).click();
    await expect(page.getByRole('heading', { name: 'Devis' })).toBeVisible();
    await expect(page.getByText('M. Martin', { exact: true })).toBeVisible();
    await expect(page.getByText(/42,00/)).toBeVisible();
    await expect(page.getByText(/N° D-\d{8}-MARTIN/)).toBeVisible();
  });

  test('impression rattachée automatiquement par le préfixe du fichier', async ({ page }) => {
    await page.goto('./#/prints');
    await page.getByRole('button', { name: 'Importer .3mf / .gcode' }).click();
    await page.getByLabel('Fichier .3mf ou .gcode').setInputFiles(file('[CADEAU] porte-cles.gcode.3mf'));
    await expect(page.getByText('Rattaché automatiquement : Cadeaux (préfixe [CADEAU])')).toBeVisible();
  });
});

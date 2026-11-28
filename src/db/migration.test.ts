import Dexie from 'dexie';
import { DB_VERSION, FilaTrackDB } from './db';

it('migration v1 → v3 : les données existantes sont conservées', async () => {
  const name = 'migration-test';
  const v1 = new Dexie(name);
  v1.version(1).stores({
    spools:
      'id, &code, legacyId, status, material, brand, productLine, catalogProductId, updatedAt, deletedAt',
    settings: 'key',
  });
  await v1.table('spools').add({ id: 's1', code: 'B01', status: 'opened', remainingG: 300 });
  await v1.table('settings').put({ key: 'app', value: { lowThresholdG: 150 } });
  v1.close();

  const db = new FilaTrackDB(name);
  expect(db.verno).toBe(DB_VERSION);
  expect(await db.spools.get('s1')).toMatchObject({ code: 'B01', remainingG: 300 });
  expect((await db.settings.get('app'))?.value).toEqual({ lowThresholdG: 150 });
  await db.shoppingItems.add({
    id: 'x',
    label: 'PLA',
    quantity: 1,
    isRefill: false,
    source: 'manual',
    createdAt: 'a',
    updatedAt: 'a',
    deletedAt: null,
  });
  expect(await db.shoppingItems.count()).toBe(1);
  await db.delete();
});

it('migration v2 → v3 : les projets existants reçoivent statut, pièces et réservations', async () => {
  const name = 'migration-v2-test';
  const v2 = new Dexie(name);
  v2.version(1).stores({
    projects: 'id, name, updatedAt',
    prints: 'id, status, date, projectId, legacyRow, updatedAt, deletedAt',
  });
  v2.version(2).stores({ shoppingItems: 'id, boughtAt, source, createdAt' });
  await v2.table('projects').bulkAdd([
    { id: 'p1', name: 'DeskShelf', archived: false },
    { id: 'p2', name: 'HomeLab', archived: false },
    { id: 'p3', name: 'Ancien', archived: true },
  ]);
  await v2.table('prints').add({ id: 'x1', projectId: 'p1', status: 'success' });
  v2.close();

  const db = new FilaTrackDB(name);
  const [p1, p2, p3] = await Promise.all(['p1', 'p2', 'p3'].map((id) => db.projects.get(id)));
  expect(p1).toMatchObject({
    status: 'printing',
    forSelf: true,
    parts: [],
    reservations: [],
    pricing: { paymentStatus: 'unpaid' },
    sync: { dirty: true },
  });
  expect(p2!.status).toBe('idea');
  expect(p3!.status).toBe('done');
  expect(await db.contacts.count()).toBe(0);
  await db.delete();
});

it('migration v3 → v4 : ajoute la boîte de réception Bambu sans toucher aux impressions', async () => {
  const name = 'migration-v3-test';
  const old = new Dexie(name);
  old.version(3).stores({ prints: 'id, status, date, projectId, legacyRow, updatedAt, deletedAt' });
  await old.table('prints').add({ id: 'x1', name: 'Boîte', status: 'success' });
  old.close();
  const db = new FilaTrackDB(name);
  expect(db.verno).toBe(DB_VERSION);
  expect(await db.prints.get('x1')).toMatchObject({ name: 'Boîte' });
  expect(await db.bambuTasks.count()).toBe(0);
  await db.delete();
});

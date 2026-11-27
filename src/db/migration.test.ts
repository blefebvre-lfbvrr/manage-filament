import Dexie from 'dexie';
import { FilaTrackDB } from './db';

it('migration v1 → v2 : les données existantes sont conservées', async () => {
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
  expect(db.verno).toBe(2);
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

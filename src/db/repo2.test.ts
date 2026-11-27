import { FilaTrackDB } from './db';
import {
  createProject,
  createSpools,
  deletePrint,
  ensureSeed,
  placeSpool,
  recordWeighing,
  restorePrint,
  savePrint,
  saveAttachment,
  undoMovement,
  unapplyPrintStock,
  type PrintInput,
  type SpoolInput,
} from './repo';

let db: FilaTrackDB;
let n = 0;
beforeEach(async () => {
  db = new FilaTrackDB(`test2-${++n}`);
  await ensureSeed(db);
});
afterEach(async () => {
  await db.delete();
});

const spool = (o: Partial<SpoolInput> = {}): SpoolInput => ({
  brand: 'Bambu Lab',
  productLine: 'PLA Basic',
  material: 'PLA',
  colorName: 'Noir',
  diameterMm: 1.75,
  initialNetG: 1000,
  tareG: 250,
  isRefill: false,
  hasRfid: true,
  status: 'sealed',
  tags: [],
  photoIds: [],
  custom: {},
  ...o,
});

const print = (spoolId: string, grams: number, o: Partial<PrintInput> = {}): PrintInput => ({
  name: 'Boîte',
  status: 'success',
  usages: [{ spoolId, grams, role: 'main' }],
  photoIds: [],
  custom: {},
  ...o,
});

const remaining = async (id: string) => (await db.spools.get(id))!.remainingG;

describe('impressions et stock', () => {
  it('déduit, ouvre la bobine scellée, puis annule la déduction', async () => {
    const [s] = await createSpools(spool(), 1, db);
    const p = await savePrint(print(s!.id, 120.5), {}, db);
    expect(p.stockApplied).toBe(true);
    expect(await remaining(s!.id)).toBe(879.5);
    expect((await db.spools.get(s!.id))!.status).toBe('opened');
    expect(await unapplyPrintStock(p.id, db)).toBe(1);
    expect(await remaining(s!.id)).toBe(1000);
    expect((await db.prints.get(p.id))!.stockApplied).toBe(false);
  });

  it('modifier une impression remplace la déduction, sans doublon si rien ne change', async () => {
    const [a, b] = await createSpools(spool(), 2, db);
    const p = await savePrint(print(a!.id, 100), {}, db);
    const before = await db.movements.count();
    await savePrint({ ...p, notes: 'juste une note' }, {}, db);
    expect(await db.movements.count()).toBe(before);
    await savePrint(
      {
        ...p,
        usages: [
          { spoolId: a!.id, grams: 60, role: 'main' },
          { spoolId: b!.id, grams: 40, role: 'relay' },
        ],
      },
      {},
      db,
    );
    expect(await remaining(a!.id)).toBe(940);
    expect(await remaining(b!.id)).toBe(960);
    await savePrint({ ...p, status: 'planned' }, {}, db);
    expect(await remaining(a!.id)).toBe(1000);
    expect(await remaining(b!.id)).toBe(1000);
  });

  it('enregistrer sans déduire', async () => {
    const [s] = await createSpools(spool(), 1, db);
    const p = await savePrint(print(s!.id, 50), { applyStock: false }, db);
    expect(p.stockApplied).toBe(false);
    expect(await remaining(s!.id)).toBe(1000);
  });

  it('suppression et restauration d’une impression', async () => {
    const [s] = await createSpools(spool(), 1, db);
    const p = await savePrint(print(s!.id, 75), {}, db);
    await deletePrint(p.id, db);
    expect((await db.prints.get(p.id))!.deletedAt).toBeTruthy();
    expect(await remaining(s!.id)).toBe(1000);
    await restorePrint(p.id, db);
    expect((await db.prints.get(p.id))!.deletedAt).toBeNull();
    expect(await remaining(s!.id)).toBe(925);
  });

  it('annuler la déduction depuis le journal met à jour l’impression', async () => {
    const [s] = await createSpools(spool(), 1, db);
    const p = await savePrint(print(s!.id, 30), {}, db);
    const m = (await db.movements.where('refId').equals(p.id).toArray())[0]!;
    await undoMovement(m.id, db);
    expect((await db.prints.get(p.id))!.stockApplied).toBe(false);
    expect(await remaining(s!.id)).toBe(1000);
  });

  it('projets sans doublon', async () => {
    const a = await createProject('DeskShelf', db);
    const b = await createProject(' deskshelf ', db);
    expect(b.id).toBe(a.id);
  });
});

describe('pesée', () => {
  it('ajuste le restant, mémorise la pesée et la tare', async () => {
    const [s] = await createSpools(spool({ needsWeighing: true }), 1, db);
    const r = await recordWeighing(s!.id, 532.4, 245, { updateTare: true, note: 'balance cuisine' }, db);
    expect(r.weighing.netG).toBe(287.4);
    expect(r.movement?.deltaG).toBe(-712.6);
    const after = (await db.spools.get(s!.id))!;
    expect(after).toMatchObject({ remainingG: 287.4, tareG: 245, needsWeighing: false });
    expect(await db.weighings.count()).toBe(1);
    // Pesée identique : pas de mouvement.
    expect((await recordWeighing(s!.id, 532.4, 245, {}, db)).movement).toBeNull();
    // Bobine vide après pesée.
    await recordWeighing(s!.id, 240, 245, {}, db);
    expect((await db.spools.get(s!.id))!.status).toBe('empty');
    await expect(recordWeighing(s!.id, -1, 245, {}, db)).rejects.toThrow('brut');
    await expect(recordWeighing(s!.id, 10, Number.NaN, {}, db)).rejects.toThrow('Tare');
    await expect(recordWeighing('x', 10, 1, {}, db)).rejects.toThrow('introuvable');
  });
});

describe('AMS', () => {
  it('place, déplace, support externe et retrait', async () => {
    const [a, b, c] = await createSpools(spool(), 3, db);
    await placeSpool(a!.id, 1, db);
    await placeSpool(b!.id, 1, db);
    expect((await db.spools.get(a!.id))!).toMatchObject({ status: 'opened', amsSlot: null });
    expect((await db.spools.get(b!.id))!).toMatchObject({ status: 'ams', amsSlot: 1 });
    await placeSpool(a!.id, 'external', db);
    await placeSpool(c!.id, 'external', db);
    expect((await db.spools.get(a!.id))!.status).toBe('opened');
    expect((await db.spools.get(c!.id))!.status).toBe('external');
    await placeSpool(b!.id, null, db);
    expect((await db.spools.get(b!.id))!).toMatchObject({ status: 'opened', amsSlot: null });
    await expect(placeSpool('x', 1, db)).rejects.toThrow();
  });
});

it('pièces jointes', async () => {
  const id = await saveAttachment(new Blob(['abc'], { type: 'text/plain' }), 'a.txt', db);
  expect((await db.attachments.get(id))!).toMatchObject({ name: 'a.txt', size: 3, mime: 'text/plain' });
});

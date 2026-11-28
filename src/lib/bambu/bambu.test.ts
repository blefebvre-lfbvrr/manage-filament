import { buildDemoData } from '../demo';
import { canAutoValidate, proposeUsages, toUsages } from './inbox';
import { mapStatus, mergeTasks, normalizeTask, normalizeTasksResponse } from './tasks';

// Forme décrite par la communauté (à confirmer sur une vraie réponse du compte).
const hit = {
  id: 123456789,
  title: 'Boîte à vis',
  plateName: 'Plateau 1',
  plateIndex: 1,
  deviceName: 'A1 Combo',
  deviceModel: 'N2S',
  deviceId: '03919A3B',
  status: 2,
  startTime: '2026-11-27T10:00:00Z',
  endTime: '2026-11-27T11:30:00Z',
  costTime: 5400,
  weight: 54.3,
  length: 18100,
  amsDetailMapping: [
    {
      ams: 0,
      sourceColor: '000000FF',
      targetColor: '000000FF',
      filamentId: 'GFA00',
      filamentType: 'PLA',
      weight: 42.1,
    },
    { ams: 2, sourceColor: 'C12E1FFF', filamentId: 'GFA00', filamentType: 'PLA', weight: 12.2 },
  ],
};

describe('normalisation des tâches Bambu', () => {
  it('champs principaux et filaments par slot', () => {
    const t = normalizeTask(hit)!;
    expect(t).toMatchObject({
      id: '123456789',
      title: 'Boîte à vis',
      status: 'success',
      durationS: 5400,
      weightG: 54.3,
      deviceName: 'A1 Combo',
      endTime: '2026-11-27T11:30:00.000Z',
    });
    expect(t.filaments).toEqual([
      { slot: 0, type: 'PLA', color: '#000000', filamentId: 'GFA00', grams: 42.1 },
      { slot: 2, type: 'PLA', color: '#C12E1F', filamentId: 'GFA00', grams: 12.2 },
    ]);
    expect(t).not.toHaveProperty('deviceId');
  });
  it('tolérant aux champs absents ou différents', () => {
    expect(normalizeTask({ id: 'x', weight: 10, startTime: 1764237600, status: 'FAILED' })).toMatchObject({
      title: 'Impression x',
      status: 'failed',
      filaments: [{ slot: null, grams: 10 }],
      startTime: '2025-11-27T10:00:00.000Z',
    });
    expect(normalizeTask({ title: 'sans id' })).toBeNull();
    expect(normalizeTask(null)).toBeNull();
    expect(
      normalizeTask({ id: 1, amsDetailMapping: [{ ams: 255, filamentType: 'PETG', weight: 5 }] })!
        .filaments[0]!.slot,
    ).toBeNull();
    expect(normalizeTasksResponse({ total: 2, hits: [hit, { nope: 1 }] })).toHaveLength(1);
    expect(normalizeTasksResponse('oops')).toEqual([]);
    expect([1, 2, 3, 4, 9, 'cancelled', 'printing', '?'].map(mapStatus)).toEqual([
      'running',
      'success',
      'failed',
      'cancelled',
      'unknown',
      'cancelled',
      'running',
      'unknown',
    ]);
  });
  it('fusion : dédoublonnage par id, plus récentes d’abord', () => {
    const a = normalizeTask(hit)!;
    const b = normalizeTask({ ...hit, id: 2, endTime: '2026-11-28T00:00:00Z' })!;
    const r1 = mergeTasks([a], [a, b]);
    expect(r1).toMatchObject({ added: 1, updated: 0 });
    expect(r1.tasks[0]!.id).toBe('2');
    expect(mergeTasks(r1.tasks, [{ ...a, title: 'renommée' }])).toMatchObject({ added: 0, updated: 1 });
  });
});

describe('boîte de réception', () => {
  const spools = buildDemoData().spools;
  it('slot AMS → bobine du slot ; correspondance sûre', () => {
    const t = normalizeTask(hit)!;
    const p = proposeUsages(t, spools);
    expect(spools.find((s) => s.id === p[0]!.spoolId)!.code).toBe('PLA-001'); // AMS 1, noir
    expect(spools.find((s) => s.id === p[1]!.spoolId)!.code).toBe('PLA-003'); // AMS 3, rouge
    expect(p.every((x) => x.certain)).toBe(true);
    expect(canAutoValidate(t, p)).toBe(true);
    expect(canAutoValidate({ ...t, status: 'failed' }, p)).toBe(false);
  });
  it('slot occupé par une autre couleur : pas sûr ; sans slot : type + couleur', () => {
    const p = proposeUsages(
      { filaments: [{ slot: 1, type: 'PLA', color: '#000000', filamentId: null, grams: 10 }] },
      spools,
    );
    expect(p[0]).toMatchObject({ certain: false });
    expect(p[0]!.reason).toContain('couleur différente');
    const q = proposeUsages(
      { filaments: [{ slot: null, type: 'TPU', color: '#000000', filamentId: null, grams: 10 }] },
      spools,
    );
    expect(spools.find((s) => s.id === q[0]!.spoolId)!.code).toBe('TPU-001');
    expect(
      proposeUsages(
        { filaments: [{ slot: null, type: 'ASA', color: null, filamentId: null, grams: 1 }] },
        spools,
      )[0]!.spoolId,
    ).toBeNull();
  });
  it('usages avec prorata pour une impression ratée', () => {
    const t = normalizeTask(hit)!;
    const u = toUsages(t, proposeUsages(t, spools), 50);
    expect(u.map((x) => [x.grams, x.plannedG, x.amsSlot])).toEqual([
      [21.1, 42.1, 1],
      [6.1, 12.2, 3],
    ]);
  });
});

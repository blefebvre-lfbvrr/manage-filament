import { GitHubClient, toBase64 } from '@/lib/cloud/github';
import type { BambuTask } from '@/lib/bambu/tasks';
import { makeProject } from '@/lib/project-factory';
import { syncCloud } from './cloud';
import { FilaTrackDB } from './db';
import {
  autoValidateBambu,
  bambuPrintInput,
  createSpools,
  ensureSeed,
  importBambuTasks,
  savePrint,
  saveSettings,
  setBambuTaskState,
  validateBambuTask,
  type SpoolInput,
} from './repo';

let db: FilaTrackDB;
let n = 0;
beforeEach(async () => {
  db = new FilaTrackDB(`inbox-${++n}`);
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
  colorHex: '#000000',
  diameterMm: 1.75,
  initialNetG: 1000,
  tareG: 250,
  isRefill: false,
  hasRfid: true,
  status: 'ams',
  amsSlot: 1,
  tags: [],
  photoIds: [],
  custom: {},
  ...o,
});

const task = (o: Partial<BambuTask> = {}): BambuTask => ({
  id: 't1',
  title: '[DUPONT] Support casque',
  plateName: null,
  plateIndex: 1,
  deviceName: 'A1',
  deviceModel: 'N2S',
  startTime: '2026-11-27T20:00:00Z',
  endTime: '2026-11-27T22:00:00Z',
  durationS: 7200,
  status: 'success',
  statusRaw: '2',
  weightG: 42.5,
  lengthMm: null,
  filaments: [{ slot: 0, type: 'PLA', color: '#000000', filamentId: 'GFA00', grams: 42.5 }],
  ...o,
});

const remaining = async (id: string) => (await db.spools.get(id))!.remainingG;

describe('boîte de réception Bambu', () => {
  it('import idempotent : une tâche connue n’est jamais réimportée', async () => {
    expect(await importBambuTasks([task(), task({ id: 't2' })], db)).toBe(2);
    expect(await importBambuTasks([task(), task({ id: 't3' })], db)).toBe(1);
    expect(await db.bambuTasks.count()).toBe(3);
  });

  it('validation : déduit une seule fois et relie l’impression', async () => {
    const [s] = await createSpools(spool(), 1, db);
    await importBambuTasks([task()], db);
    const usages = [{ spoolId: s!.id, grams: 42.5, role: 'main' as const }];
    const p = await validateBambuTask('t1', bambuPrintInput(task(), usages, null, null), db);
    expect(p).toMatchObject({ name: '[DUPONT] Support casque', durationMin: 120, date: '2026-11-27' });
    expect(p.custom).toMatchObject({ bambuTaskId: 't1' });
    expect(await remaining(s!.id)).toBe(957.5);
    await expect(validateBambuTask('t1', bambuPrintInput(task(), usages, null, null), db)).rejects.toThrow(
      /déjà validée/,
    );
    expect(await remaining(s!.id)).toBe(957.5);
    // Le cloud renvoie la même tâche : ni réimport ni nouvelle déduction.
    expect(await importBambuTasks([task()], db)).toBe(0);
    expect((await db.bambuTasks.get('t1'))!).toMatchObject({ state: 'validated', printId: p.id });
    await expect(setBambuTaskState('t1', 'ignored', db)).rejects.toThrow();
  });

  it('échec : consommation au prorata de l’avancement', async () => {
    const t = task({ status: 'failed' });
    const input = bambuPrintInput(t, [], null, 40);
    expect(input).toMatchObject({ status: 'failed', failedAtPercent: 40 });
    expect(bambuPrintInput(task({ status: 'cancelled' }), [], null, 10).status).toBe('cancelled');
  });

  it('ignorer puis remettre à valider', async () => {
    await importBambuTasks([task()], db);
    await setBambuTaskState('t1', 'ignored', db);
    expect((await db.bambuTasks.get('t1'))!.state).toBe('ignored');
    await importBambuTasks([task()], db);
    expect((await db.bambuTasks.get('t1'))!.state).toBe('ignored');
    await setBambuTaskState('t1', 'pending', db);
    expect((await db.bambuTasks.get('t1'))!.state).toBe('pending');
  });

  it('validation automatique : seulement si réussie et sûre, avec le projet [CODE]', async () => {
    await saveSettings({ bambu: { autoValidate: true, autoValidateSince: '2026-11-01T00:00:00Z' } }, db);
    const [s] = await createSpools(spool(), 1, db);
    await db.projects.add(makeProject('Dupont', { id: 'p1', code: 'DUPONT' }));
    await importBambuTasks(
      [
        task(),
        task({ id: 't2', status: 'failed' }),
        task({
          id: 't3',
          filaments: [{ slot: 0, type: 'PLA', color: '#FF0000', filamentId: null, grams: 5 }],
        }),
      ],
      db,
    );
    expect(await autoValidateBambu(db)).toBe(1);
    const ok = await db.bambuTasks.get('t1');
    expect(ok!.state).toBe('validated');
    expect((await db.prints.get(ok!.printId!))!.projectId).toBe('p1');
    expect((await db.bambuTasks.get('t2'))!.state).toBe('pending');
    expect((await db.bambuTasks.get('t3'))!.state).toBe('pending');
    expect(await remaining(s!.id)).toBe(957.5);
    expect(await autoValidateBambu(db)).toBe(0);
  });

  it('validation automatique : jamais l’historique ni un doublon probable', async () => {
    const [s] = await createSpools(spool(), 1, db);
    // Option activée sans date : la date est fixée maintenant, l'historique reçu n'est pas touché.
    await saveSettings({ bambu: { autoValidate: true } }, db);
    await importBambuTasks([task()], db);
    expect(await autoValidateBambu(db)).toBe(0);
    expect((await db.settings.get('app'))!.value).toMatchObject({
      bambu: { autoValidateSince: expect.any(String) },
    });
    // Impression déjà saisie le même jour avec le même poids (import Excel) : pas de validation auto.
    await saveSettings({ bambu: { autoValidate: true, autoValidateSince: '2026-11-01T00:00:00Z' } }, db);
    await savePrint(
      {
        name: 'Support casque',
        date: '2026-11-27',
        status: 'success',
        usages: [{ spoolId: s!.id, grams: 42, role: 'main' }],
        photoIds: [],
        custom: {},
      },
      {},
      db,
    );
    expect(await autoValidateBambu(db)).toBe(0);
    expect(await remaining(s!.id)).toBe(958);
  });

  it('synchro : récupère bambu/prints.json depuis le dépôt de données', async () => {
    const file = {
      version: 1,
      updatedAt: '2026-11-27T22:05:00Z',
      checkedAt: '2026-11-28T04:00:00Z',
      tasks: [task()],
    };
    const content = toBase64(new TextEncoder().encode(JSON.stringify(file)));
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const path = decodeURIComponent(new URL(String(input)).pathname);
      if (path.endsWith('/contents/bambu/prints.json'))
        return new Response(JSON.stringify({ sha: 's1', content, encoding: 'base64' }), { status: 200 });
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }) as typeof fetch;
    const client = new GitHubClient({ owner: 'me', repo: 'data', branch: 'main', token: 't' }, fetchImpl);
    await createSpools(spool(), 1, db);
    await saveSettings({ bambu: { autoValidate: true, autoValidateSince: '2026-11-01T00:00:00Z' } }, db);
    const r = await syncCloud(client, db);
    expect(r).toMatchObject({ bambuNew: 1, bambuAuto: 1, errors: [] });
    expect((await db.settings.get('app'))!.value).toMatchObject({
      bambu: { lastFileUpdatedAt: '2026-11-27T22:05:00Z', lastCheckedAt: '2026-11-28T04:00:00Z' },
    });
    expect(await syncCloud(client, db)).toMatchObject({ bambuNew: 0, bambuAuto: 0 });
  });
});

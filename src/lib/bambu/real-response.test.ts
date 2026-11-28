import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDemoData } from '../demo';
import { makeProject } from '../project-factory';
import { matchTaskProject, proposeUsages } from './inbox';
import { normalizeTasksResponse, splitTitle } from './tasks';

/** Vraie réponse anonymisée du cloud Bambu (voir tests/fixtures/bambu-tasks.json). */
const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/bambu-tasks.json'), 'utf8'));
const tasks = normalizeTasksResponse(raw);

describe('vraie réponse du cloud Bambu', () => {
  it('normalise les champs vérifiés', () => {
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      id: '1496238739',
      fileName: 'DeskShelf - Projet complet (35 plateaux)',
      plateName: 'Cubby 6W x 3H Single',
      plateIndex: 9,
      status: 'success',
      statusRaw: 2,
      deviceModel: 'A1',
      weightG: 179.06,
      lengthMm: 59080,
      startTime: '2026-11-28T07:21:24.000Z',
      endTime: '2026-11-28T10:16:29.000Z',
      // Durée réelle (fin − début), pas l'estimation costTime (11908 s).
      durationS: 10505,
      filaments: [{ slot: 0, type: 'PLA', color: '#000000', filamentId: 'GFA00', grams: 179.06 }],
    });
    // 2e tâche : impression bien plus longue que l'estimation (pause).
    expect(tasks[1]!.durationS).toBe(11608);
    // « ams » donne le slot (1 ⇒ slot AMS 2), pas amsId/slotId du même bloc (0/0).
    expect(tasks[2]!.filaments[0]!.slot).toBe(1);
  });

  it('titre « fichier_NN - plateau »', () => {
    expect(splitTitle('Boite_3', 3)).toEqual({ fileName: 'Boite', plateName: null });
    expect(splitTitle('Boite_3 - Couvercle', 4)).toEqual({ fileName: null, plateName: null });
    expect(splitTitle('Benchy', null)).toEqual({ fileName: null, plateName: null });
  });

  it('bobine du slot AMS et projet par son nom', () => {
    const spools = buildDemoData().spools; // slot 1 : PLA Basic Noir, slot 2 : Blanc de jade
    expect(proposeUsages(tasks[0]!, spools)[0]).toMatchObject({ spoolId: spools[0]!.id, certain: true });
    const projects = [makeProject('DeskShelf', { id: 'p1' }), makeProject('Desk', { id: 'p2' })];
    expect(matchTaskProject(tasks[0]!, projects)).toMatchObject({ project: { id: 'p1' }, plateIndex: null });
    const withPart = makeProject('Étagère bureau', {
      id: 'p3',
      parts: [
        {
          id: 'part1',
          name: 'DeskShelf',
          fileName: 'DeskShelf - Projet complet (35 plateaux).gcode.3mf',
          quantity: 1,
          plates: [{ index: 9, name: null, predictionS: 0, filaments: [] }],
        } as never,
      ],
    });
    expect(matchTaskProject(tasks[0]!, [withPart])).toMatchObject({
      project: { id: 'p3' },
      part: { id: 'part1' },
      plateIndex: 9,
    });
  });
});

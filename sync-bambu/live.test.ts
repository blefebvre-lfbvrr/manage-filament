import { describe as group, expect, it } from 'vitest';
import { describe, EMPTY_LIVE, finished, mergeReport, watchdog } from './live-state';

group('temps réel MQTT', () => {
  it('fusionne les rapports partiels', () => {
    let s = mergeReport(EMPTY_LIVE, {
      print: {
        gcode_state: 'RUNNING',
        mc_percent: 12,
        mc_remaining_time: 80,
        subtask_name: 'Benchy',
        layer_num: 10,
        total_layer_num: 200,
        ams: {
          tray_now: '1',
          ams: [
            {
              id: '0',
              tray: [
                { id: '0', tray_type: 'PLA', tray_color: '000000FF', remain: 40 },
                { id: '1', tray_type: 'PETG', tray_color: 'FFFFFFFF', remain: -1 },
              ],
            },
          ],
        },
      },
    });
    s = mergeReport(s, { print: { mc_percent: 13 } });
    expect(s).toMatchObject({ gcodeState: 'RUNNING', percent: 13, taskName: 'Benchy', trayNow: 1 });
    expect(s.ams).toEqual([
      { slot: 0, type: 'PLA', color: '#000000', remainPct: 40 },
      { slot: 1, type: 'PETG', color: '#FFFFFF', remainPct: null },
    ]);
    expect(describe(s)).toBe('RUNNING · « Benchy » · 13 % · reste 80 min · couche 10/200 · slot 2');
    expect(mergeReport(s, 'bruit').percent).toBe(13);
    expect(describe(EMPTY_LIVE)).toMatch(/attente/);
  });
  it('détecte la fin d’impression', () => {
    const run = { ...EMPTY_LIVE, gcodeState: 'RUNNING' };
    expect(finished(run, { ...run, gcodeState: 'FINISH' })).toBe('success');
    expect(finished(run, { ...run, gcodeState: 'FAILED' })).toBe('failed');
    expect(finished({ ...run, gcodeState: 'IDLE' }, { ...run, gcodeState: 'FINISH' })).toBeNull();
    expect(finished(run, run)).toBeNull();
  });
  it('chien de garde', () => {
    expect(watchdog(0, 30_000)).toBe('ok');
    expect(watchdog(0, 90_000)).toBe('pushall');
    expect(watchdog(0, 200_000)).toBe('reconnect');
  });
});

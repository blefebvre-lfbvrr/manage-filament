import * as XLSX from 'xlsx';
import { downloadBlob, downloadText, todayStamp } from '@/app/download';
import { getDb } from '@/db/db';
import { exportBackup, getSettings, markBackupDone } from '@/db/repo';
import { backupFileName } from '@/lib/backup';
import { movementRows, printRows, projectRows, spoolRows, toCsv, type Row } from '@/lib/export';

async function loadAll() {
  const db = getDb();
  const [spools, prints, movements, projects, defs, settings] = await Promise.all([
    db.spools.toArray(),
    db.prints.toArray(),
    db.movements.toArray(),
    db.projects.toArray(),
    db.customFieldDefs.toArray(),
    getSettings(),
  ]);
  const labels = Object.fromEntries(defs.filter((d) => d.entity === 'spool').map((d) => [d.key, d.label]));
  return {
    spools: spoolRows(spools, settings, labels),
    prints: printRows(prints, spools, projects),
    movements: movementRows(movements, spools),
    projects: projectRows(projects),
  };
}

function sheet(rows: Row[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(
      40,
      Math.max(h.length + 2, ...rows.slice(0, 200).map((r) => String(r[h] ?? '').length + 1)),
    ),
  }));
  return ws;
}

export async function exportExcel() {
  const data = await loadAll();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(data.spools), 'Bobines');
  XLSX.utils.book_append_sheet(wb, sheet(data.prints), 'Impressions');
  XLSX.utils.book_append_sheet(wb, sheet(data.movements), 'Mouvements');
  XLSX.utils.book_append_sheet(wb, sheet(data.projects), 'Projets');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `filatrack-export-${todayStamp()}.xlsx`,
  );
}

export async function exportCsv(kind: 'spools' | 'prints' | 'movements') {
  const data = await loadAll();
  const names = { spools: 'bobines', prints: 'impressions', movements: 'mouvements' };
  downloadText(toCsv(data[kind]), `filatrack-${names[kind]}-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
}

export async function exportJsonBackup() {
  const backup = await exportBackup();
  downloadText(JSON.stringify(backup, null, 2), backupFileName(), 'application/json');
  await markBackupDone();
}

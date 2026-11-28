import { newId, nowIso } from './ids';
import type { Project } from './schemas';

/** Nouveau projet avec toutes les valeurs par défaut. */
export function makeProject(name: string, extra: Partial<Project> = {}): Project {
  const now = nowIso();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: name.trim(),
    code: null,
    description: null,
    color: null,
    tags: [],
    photoIds: [],
    forSelf: true,
    contactId: null,
    status: 'idea',
    archived: false,
    dueDate: null,
    deliveredAt: null,
    budget: null,
    parts: [],
    reservations: [],
    pricing: { paymentStatus: 'unpaid' },
    notes: null,
    history: [],
    sync: { dirty: true },
    ...extra,
  };
}

import { v4 as uuidv4 } from 'uuid';

import type { TimelineEntry, TimelineInput } from '../shared/types';
import { getDatabase } from './database';

export function listTimeline(locationId: string): TimelineEntry[] {
  const db = getDatabase();
  return db
    .prepare(
      'SELECT * FROM timeline_events WHERE location_id = ? ORDER BY year ASC, title ASC',
    )
    .all(locationId) as TimelineEntry[];
}

export function createTimelineEntry(input: TimelineInput): TimelineEntry {
  const db = getDatabase();
  const entry: TimelineEntry = {
    id: uuidv4(),
    location_id: input.location_id,
    category: input.category,
    year: input.year,
    title: input.title,
    description: input.description ?? '',
  };
  db.prepare(
    `INSERT INTO timeline_events (id, location_id, category, year, title, description)
     VALUES (@id, @location_id, @category, @year, @title, @description)`,
  ).run(entry);
  return entry;
}

export function updateTimelineEntry(
  id: string,
  input: Partial<Omit<TimelineEntry, 'id' | 'location_id'>>,
): TimelineEntry | null {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(id) as
    | TimelineEntry
    | undefined;
  if (!existing) return null;
  const updated = { ...existing, ...input, id };
  db.prepare(
    `UPDATE timeline_events SET category = @category, year = @year, title = @title, description = @description
     WHERE id = @id`,
  ).run(updated);
  return updated;
}

export function deleteTimelineEntry(id: string): boolean {
  const db = getDatabase();
  return db.prepare('DELETE FROM timeline_events WHERE id = ?').run(id).changes > 0;
}

export function countTimelineForLocation(locationId: string): number {
  const db = getDatabase();
  const row = db
    .prepare('SELECT COUNT(*) as c FROM timeline_events WHERE location_id = ?')
    .get(locationId) as { c: number };
  return row.c;
}

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

import {
  ARCHIVE_ID_INDEX_WIDTH,
  getArchiveIdPrefix,
  normalizeArchiveClass,
  normalizeSiteType,
} from '../shared/archive-meta';
import type { Location, LocationFilters, LocationInput } from '../shared/types';
import { getArchivePaths } from './archive-path';
import { loadSettings } from './settings';

let db: Database.Database | null = null;

const CURRENT_SCHEMA_VERSION = 5;

const MIGRATION_LOG =
  process.env.MOARCHIVE_DEBUG_MIGRATIONS === '1' || process.env.NODE_ENV !== 'production';

/** New installs get the full modern locations table. Existing DBs are upgraded via ALTER. */
const LOCATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  archive_uuid TEXT DEFAULT '',
  archive_id TEXT DEFAULT '',
  origin_machine_id TEXT DEFAULT '',
  map_signature TEXT DEFAULT '',
  archive_class TEXT DEFAULT 'structure_site',
  name TEXT NOT NULL,
  location_text TEXT DEFAULT '',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  type TEXT DEFAULT 'industrial',
  status TEXT DEFAULT 'unknown',
  risk_level TEXT DEFAULT 'unknown',
  priority_override TEXT DEFAULT '',
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  structural_notes TEXT DEFAULT '',
  access_notes TEXT DEFAULT '',
  research_notes TEXT DEFAULT '',
  county TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT 'MO',
  date_added TEXT NOT NULL,
  date_modified TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  media_folder TEXT DEFAULT '',
  source_links TEXT DEFAULT '',
  building_count INTEGER DEFAULT 0,
  coordinates_audited INTEGER DEFAULT 0
)`;

const TIMELINE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
)`;

const SCHEMA_META_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

/** Columns added after v1 — applied only when missing from an existing database. */
const MIGRATION_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'archive_uuid', ddl: "ALTER TABLE locations ADD COLUMN archive_uuid TEXT DEFAULT ''" },
  { name: 'origin_machine_id', ddl: "ALTER TABLE locations ADD COLUMN origin_machine_id TEXT DEFAULT ''" },
  { name: 'map_signature', ddl: "ALTER TABLE locations ADD COLUMN map_signature TEXT DEFAULT ''" },
  { name: 'archive_id', ddl: "ALTER TABLE locations ADD COLUMN archive_id TEXT DEFAULT ''" },
  {
    name: 'archive_class',
    ddl: "ALTER TABLE locations ADD COLUMN archive_class TEXT DEFAULT 'structure_site'",
  },
  { name: 'priority_override', ddl: "ALTER TABLE locations ADD COLUMN priority_override TEXT DEFAULT ''" },
  { name: 'structural_notes', ddl: "ALTER TABLE locations ADD COLUMN structural_notes TEXT DEFAULT ''" },
  { name: 'access_notes', ddl: "ALTER TABLE locations ADD COLUMN access_notes TEXT DEFAULT ''" },
  { name: 'research_notes', ddl: "ALTER TABLE locations ADD COLUMN research_notes TEXT DEFAULT ''" },
  { name: 'building_count', ddl: 'ALTER TABLE locations ADD COLUMN building_count INTEGER DEFAULT 0' },
  { name: 'coordinates_audited', ddl: 'ALTER TABLE locations ADD COLUMN coordinates_audited INTEGER DEFAULT 0' },
];

function migrationLog(message: string, detail?: unknown): void {
  if (MIGRATION_LOG) {
    console.info(`[archive:migrate] ${message}`, detail ?? '');
  }
}

function getTableColumns(database: Database.Database, table: string): Set<string> {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(cols.map((c) => c.name));
}

function tableExists(database: Database.Database, table: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function getSchemaVersion(database: Database.Database): number {
  if (!tableExists(database, 'schema_meta')) return 0;
  const row = database
    .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) || 0 : 0;
}

function setSchemaVersion(database: Database.Database, version: number): void {
  database
    .prepare(
      `INSERT INTO schema_meta (key, value) VALUES ('schema_version', @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run({ value: String(version) });
}

function migrateLocationColumns(database: Database.Database): void {
  const existing = getTableColumns(database, 'locations');
  for (const { name, ddl } of MIGRATION_COLUMNS) {
    if (!existing.has(name)) {
      migrationLog(`adding column locations.${name}`);
      database.exec(ddl);
      existing.add(name);
    }
  }
}

function ensureIndexes(database: Database.Database): void {
  const locationCols = getTableColumns(database, 'locations');

  const locationIndexes: Array<{ ddl: string; requires?: string }> = [
    { ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_county ON locations(county)' },
    { ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_city ON locations(city)' },
    { ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type)' },
    { ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status)' },
    { ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_risk ON locations(risk_level)' },
    {
      ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_archive_class ON locations(archive_class)',
      requires: 'archive_class',
    },
    {
      ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_archive_id ON locations(archive_id)',
      requires: 'archive_id',
    },
    {
      ddl: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_archive_uuid ON locations(archive_uuid)',
      requires: 'archive_uuid',
    },
    {
      ddl: 'CREATE INDEX IF NOT EXISTS idx_locations_origin_machine_id ON locations(origin_machine_id)',
      requires: 'origin_machine_id',
    },
  ];

  for (const { ddl, requires } of locationIndexes) {
    if (requires && !locationCols.has(requires)) continue;
    database.exec(ddl);
  }

  if (tableExists(database, 'timeline_events')) {
    database.exec(
      'CREATE INDEX IF NOT EXISTS idx_timeline_location ON timeline_events(location_id)',
    );
  }
}

function rowToLocation(row: Record<string, unknown>): Location {
  return {
    id: String(row.id),
    archive_uuid: String(row.archive_uuid ?? row.id ?? ''),
    archive_id: String(row.archive_id ?? ''),
    origin_machine_id: String(row.origin_machine_id ?? ''),
    map_signature: String(row.map_signature ?? ''),
    archive_class: String(row.archive_class ?? 'structure_site'),
    name: String(row.name),
    location_text: String(row.location_text ?? ''),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    type: String(row.type ?? 'industrial'),
    status: String(row.status ?? 'unknown'),
    risk_level: String(row.risk_level ?? 'unknown'),
    priority_override: String(row.priority_override ?? ''),
    description: String(row.description ?? ''),
    notes: String(row.notes ?? ''),
    structural_notes: String(row.structural_notes ?? ''),
    access_notes: String(row.access_notes ?? ''),
    research_notes: String(row.research_notes ?? ''),
    county: String(row.county ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? 'MO'),
    date_added: String(row.date_added),
    date_modified: String(row.date_modified),
    tags: String(row.tags ?? '[]'),
    media_folder: String(row.media_folder ?? ''),
    source_links: String(row.source_links ?? ''),
    building_count: Number(row.building_count ?? 0),
    coordinates_audited: Number(row.coordinates_audited ?? 0) ? 1 : 0,
  };
}

function runMigrations(database: Database.Database): void {
  const priorVersion = getSchemaVersion(database);
  migrationLog('start', { priorVersion, target: CURRENT_SCHEMA_VERSION });

  database.exec(SCHEMA_META_SQL);

  database.exec(LOCATIONS_TABLE_SQL);
  migrateLocationColumns(database);

  database.exec(TIMELINE_TABLE_SQL);

  const locationCols = getTableColumns(database, 'locations');
  if (locationCols.has('archive_id')) {
    backfillArchiveIds(database);
  }
  if (locationCols.has('archive_uuid')) {
    backfillArchiveIdentity(database);
  }
  if (locationCols.has('map_signature')) {
    backfillMapSignatures(database);
  }

  ensureIndexes(database);

  setSchemaVersion(database, CURRENT_SCHEMA_VERSION);
  migrationLog('complete', { version: CURRENT_SCHEMA_VERSION });
}

function backfillArchiveIdentity(database: Database.Database): void {
  const settings = loadSettings();
  const missingUuid = database
    .prepare("SELECT id FROM locations WHERE archive_uuid IS NULL OR archive_uuid = ''")
    .all() as { id: string }[];
  for (const row of missingUuid) {
    database.prepare('UPDATE locations SET archive_uuid = ? WHERE id = ?').run(uuidv4(), row.id);
  }

  const missingOrigin = database
    .prepare("SELECT id FROM locations WHERE origin_machine_id IS NULL OR origin_machine_id = ''")
    .all() as { id: string }[];
  for (const row of missingOrigin) {
    database
      .prepare('UPDATE locations SET origin_machine_id = ? WHERE id = ?')
      .run(settings.currentMachineId, row.id);
  }
}

function backfillMapSignatures(database: Database.Database): void {
  const settings = loadSettings();
  const missingSignature = database
    .prepare("SELECT id, origin_machine_id FROM locations WHERE map_signature IS NULL OR map_signature = ''")
    .all() as { id: string; origin_machine_id: string }[];

  for (const row of missingSignature) {
    const trusted = settings.trustedSignatures.find((entry) => entry.machineId === row.origin_machine_id);
    const signature =
      row.origin_machine_id === settings.currentMachineId
        ? settings.mapSignature
        : trusted?.signature ?? '';
    if (!signature) continue;
    database.prepare('UPDATE locations SET map_signature = ? WHERE id = ?').run(signature, row.id);
  }
}

function backfillArchiveIds(database: Database.Database): void {
  const missing = database
    .prepare(
      "SELECT id, type, state, archive_class FROM locations WHERE archive_id IS NULL OR archive_id = ''",
    )
    .all() as { id: string; type: string; state: string; archive_class: string }[];
  if (missing.length === 0) return;
  migrationLog(`backfill archive_id for ${missing.length} row(s)`);
  for (const row of missing) {
    const archiveId = generateArchiveId(
      database,
      row.type,
      row.state || 'MO',
      row.archive_class || 'structure_site',
    );
    database.prepare('UPDATE locations SET archive_id = ? WHERE id = ?').run(archiveId, row.id);
  }
}

export function generateArchiveId(
  database: Database.Database,
  type: string,
  state = 'MO',
  archiveClass = 'structure_site',
): string {
  // Each archive family has its own sequence: MO-IND, MO-NAT, MO-RUM, MO-FOL, etc.
  const prefix = `${getArchiveIdPrefix(state, archiveClass, type)}-`;
  const row = database
    .prepare('SELECT archive_id FROM locations WHERE archive_id LIKE ? ORDER BY archive_id DESC LIMIT 1')
    .get(`${prefix}%`) as { archive_id: string } | undefined;
  let next = 1;
  if (row?.archive_id) {
    const part = row.archive_id.slice(prefix.length);
    const n = parseInt(part, 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(ARCHIVE_ID_INDEX_WIDTH, '0')}`;
}

export function initDatabase(): Database.Database {
  if (db) return db;

  const { database: dbPath } = getArchivePaths();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function getDatabase(): Database.Database {
  return initDatabase();
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function listLocations(filters: LocationFilters = {}): Location[] {
  const database = getDatabase();
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      `(name LIKE ? OR archive_id LIKE ? OR archive_class LIKE ? OR location_text LIKE ? OR description LIKE ? OR notes LIKE ?
       OR structural_notes LIKE ? OR access_notes LIKE ? OR research_notes LIKE ?
       OR county LIKE ? OR city LIKE ? OR source_links LIKE ?)`,
    );
    params.push(q, q, q, q, q, q, q, q, q, q, q, q);
  }
  if (filters.archive_class) {
    conditions.push('archive_class = ?');
    params.push(filters.archive_class);
  }
  if (filters.county) {
    conditions.push('county = ?');
    params.push(filters.county);
  }
  if (filters.city) {
    conditions.push('city = ?');
    params.push(filters.city);
  }
  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.risk_level) {
    conditions.push('risk_level = ?');
    params.push(filters.risk_level);
  }
  if (filters.date_from) {
    conditions.push('date_added >= ?');
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push('date_added <= ?');
    params.push(filters.date_to);
  }

  const sql = `SELECT * FROM locations WHERE ${conditions.join(' AND ')} ORDER BY date_modified DESC`;
  const rows = database.prepare(sql).all(...params) as Record<string, unknown>[];

  let locations = rows.map(rowToLocation);

  if (filters.tags?.length) {
    locations = locations.filter((loc) => {
      const tags = parseTags(loc.tags);
      return filters.tags!.some((t) => tags.includes(t.toLowerCase()));
    });
  }

  return locations;
}

export function getLocation(id: string): Location | null {
  const database = getDatabase();
  const row = database.prepare('SELECT * FROM locations WHERE id = ?').get(id);
  return row ? rowToLocation(row as Record<string, unknown>) : null;
}

export function getLocationByArchiveUUID(archiveUUID: string): Location | null {
  const database = getDatabase();
  const row = database.prepare('SELECT * FROM locations WHERE archive_uuid = ?').get(archiveUUID);
  return row ? rowToLocation(row as Record<string, unknown>) : null;
}

export function getLocationByArchiveId(archiveId: string): Location | null {
  const normalized = archiveId.trim().toUpperCase();
  if (!normalized) return null;
  const database = getDatabase();
  const row = database.prepare('SELECT * FROM locations WHERE UPPER(archive_id) = ?').get(normalized);
  return row ? rowToLocation(row as Record<string, unknown>) : null;
}

export function createLocation(input: LocationInput): Location {
  const database = getDatabase();
  const now = new Date().toISOString();
  const id = input.id ?? uuidv4();
  const settings = loadSettings();
  const { media } = getArchivePaths();
  const siteType = normalizeSiteType(input.type ?? 'industrial');
  const archiveClass = normalizeArchiveClass(input.archive_class);
  const archiveId =
    input.archive_id?.trim() ||
    generateArchiveId(database, siteType, input.state ?? 'MO', archiveClass);
  const mediaFolder = input.media_folder || `${media}/${archiveId}`;

  const location: Location = {
    id,
    archive_uuid: input.archive_uuid || uuidv4(),
    archive_id: archiveId,
    origin_machine_id: input.origin_machine_id || settings.currentMachineId,
    map_signature: input.map_signature || settings.mapSignature,
    archive_class: archiveClass,
    name: input.name,
    location_text: input.location_text ?? '',
    latitude: input.latitude,
    longitude: input.longitude,
    type: siteType,
    status: input.status ?? 'unknown',
    risk_level: input.risk_level ?? 'unknown',
    priority_override: input.priority_override ?? '',
    description: input.description ?? '',
    notes: input.notes ?? '',
    structural_notes: input.structural_notes ?? '',
    access_notes: input.access_notes ?? '',
    research_notes: input.research_notes ?? '',
    county: input.county ?? '',
    city: input.city ?? '',
    state: input.state ?? 'MO',
    date_added: input.date_added ?? now,
    date_modified: input.date_modified ?? now,
    tags: input.tags ?? '[]',
    media_folder: mediaFolder,
    source_links: input.source_links ?? '',
    building_count: input.building_count ?? 0,
    coordinates_audited: input.coordinates_audited ? 1 : 0,
  };

  database
    .prepare(
      `INSERT INTO locations (
        id, archive_uuid, archive_id, origin_machine_id, map_signature, name, location_text, latitude, longitude, type, status, risk_level,
        archive_class, priority_override, description, notes, structural_notes, access_notes, research_notes,
        county, city, state, date_added, date_modified, tags, media_folder, source_links,
        building_count, coordinates_audited
      ) VALUES (
        @id, @archive_uuid, @archive_id, @origin_machine_id, @map_signature, @name, @location_text, @latitude, @longitude, @type, @status, @risk_level,
        @archive_class, @priority_override, @description, @notes, @structural_notes, @access_notes, @research_notes,
        @county, @city, @state, @date_added, @date_modified, @tags, @media_folder, @source_links,
        @building_count, @coordinates_audited
      )`,
    )
    .run(location);

  return location;
}

export function updateLocation(id: string, input: Partial<LocationInput>): Location | null {
  const existing = getLocation(id);
  if (!existing) return null;

  const database = getDatabase();
  const now = new Date().toISOString();
  const updated: Location = {
    ...existing,
    ...input,
    id,
    origin_machine_id:
      input.origin_machine_id !== undefined ? input.origin_machine_id : existing.origin_machine_id,
    map_signature: input.map_signature !== undefined ? input.map_signature : existing.map_signature,
    archive_class: input.archive_class
      ? normalizeArchiveClass(input.archive_class)
      : existing.archive_class,
    type: input.type ? normalizeSiteType(input.type) : existing.type,
    date_modified: now,
    coordinates_audited:
      input.coordinates_audited !== undefined
        ? input.coordinates_audited
          ? 1
          : 0
        : existing.coordinates_audited,
  };

  database
    .prepare(
      `UPDATE locations SET
        archive_uuid = @archive_uuid, archive_id = @archive_id, origin_machine_id = @origin_machine_id,
        map_signature = @map_signature,
        name = @name, location_text = @location_text,
        latitude = @latitude, longitude = @longitude,
        type = @type, status = @status, risk_level = @risk_level,
        archive_class = @archive_class,
        priority_override = @priority_override,
        description = @description, notes = @notes,
        structural_notes = @structural_notes, access_notes = @access_notes,
        research_notes = @research_notes,
        county = @county, city = @city, state = @state,
        date_modified = @date_modified, tags = @tags,
        media_folder = @media_folder, source_links = @source_links,
        building_count = @building_count, coordinates_audited = @coordinates_audited
      WHERE id = @id`,
    )
    .run(updated);

  return updated;
}

export function deleteLocation(id: string): boolean {
  const database = getDatabase();
  const result = database.prepare('DELETE FROM locations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getDistinctValues(
  field: 'archive_class' | 'county' | 'city' | 'type' | 'status' | 'risk_level',
): string[] {
  const database = getDatabase();
  const allowed = ['archive_class', 'county', 'city', 'type', 'status', 'risk_level'];
  if (!allowed.includes(field)) return [];
  const rows = database
    .prepare(
      `SELECT DISTINCT ${field} as value FROM locations WHERE ${field} IS NOT NULL AND ${field} != '' ORDER BY value`,
    )
    .all() as { value: string }[];
  return rows.map((r) => r.value);
}

export function getAllTags(): string[] {
  const locations = listLocations();
  const tagSet = new Set<string>();
  for (const loc of locations) {
    for (const tag of parseTags(loc.tags)) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}

export function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    }
  } catch {
    /* fallback comma-separated */
  }
  return tagsJson
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function tagsToJson(tags: string[]): string {
  return JSON.stringify(tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
}

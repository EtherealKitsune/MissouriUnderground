import { dialog } from 'electron';
import fs from 'node:fs';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { v4 as uuidv4 } from 'uuid';
import type yauzlType from 'yauzl';

import type {
  MoarchDuplicateAction,
  MoarchImportOptions,
  MoarchImportPreview,
  MoarchImportResult,
  MoarchArchivePreview,
  TimelineEntry,
} from '../shared/types';
import { getArchivePaths } from './archive-path';
import {
  createLocation,
  getLocationByArchiveUUID,
  tagsToJson,
} from './database';
import { addMediaFiles } from './media';
import { readChecksumsFile, verifyChecksumManifest } from './moarch-integrity';
import { createTimelineEntry } from './timeline';
import { cleanupTempPath } from './temp-cleanup';

const MOARCH_FORMAT_VERSION = 1;
const require = createRequire(import.meta.url);
const yauzl = require('yauzl') as typeof yauzlType;

interface PendingMoarchImport {
  extractPath: string;
  sourceFile: string;
  previews: MoarchArchivePreview[];
}

interface MoarchManifest {
  formatVersion?: number;
  packageType?: string;
  archiveUUID?: string;
  originMachineId?: string;
  mapSignature?: string;
  signature?: string | null;
  archives?: Array<{
    archive_uuid?: string;
    archive_id?: string;
    origin_machine_id?: string;
    map_signature?: string;
    folder?: string;
    hero_image?: string | null;
    research_count?: number;
  }>;
}

interface MoarchArchiveRecord {
  archive_uuid?: string;
  origin_machine_id?: string;
  map_signature?: string;
  archive_id?: string;
  archive_class?: string;
  type?: string;
  name?: string;
  location_text?: string;
  coordinates?: { latitude?: number; longitude?: number; audited?: boolean };
  status?: string;
  risk_level?: string;
  priority_override?: string;
  tags?: string[];
  description?: string;
  notes?: string;
  structural_notes?: string;
  access_notes?: string;
  research_notes?: string;
  source_links?: string;
  building_count?: number;
  date_added?: string;
  date_modified?: string;
}

interface MoarchArchiveJson {
  export_type?: string;
  archive?: MoarchArchiveRecord;
  timeline?: Array<Omit<TimelineEntry, 'location_id'>>;
  media?: {
    hero_image?: string | null;
    research?: string[];
  };
}

const pendingImports = new Map<string, PendingMoarchImport>();

export async function prepareMoarchImport(): Promise<MoarchImportPreview | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Import .moarch package',
    filters: [{ name: 'Missouri Underground Archive', extensions: ['moarch', 'zip'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const sourceFile = result.filePaths[0];
  const sessionId = uuidv4();
  const extractPath = path.join(
    getArchivePaths().exports,
    `.moarch-import-${Date.now()}-${sessionId.slice(0, 8)}`,
  );

  const errors: string[] = [];
  try {
    fs.mkdirSync(extractPath, { recursive: true });
    await extractZip(sourceFile, extractPath);
    const integrity = verifyChecksumManifest(extractPath, readChecksumsFile(extractPath));
    const previews = buildPreviews(extractPath, errors);
    const valid = previews.length > 0 && errors.length === 0;

    if (!valid) {
      void cleanupExtract(extractPath);
      return {
        sessionId,
        sourceFile,
        packageLabel: path.basename(sourceFile),
        archives: previews,
        integrityStatus: integrity.status,
        integrityIssues: integrity.issues,
        errors,
        valid: false,
      };
    }

    pendingImports.set(sessionId, { extractPath, sourceFile, previews });
    return {
      sessionId,
      sourceFile,
      packageLabel: path.basename(sourceFile),
      archives: previews,
      integrityStatus: integrity.status,
      integrityIssues: integrity.issues,
      errors,
      valid: true,
    };
  } catch (err) {
    void cleanupExtract(extractPath);
    errors.push(err instanceof Error ? err.message : 'Failed to read .moarch package.');
    return {
      sessionId,
      sourceFile,
      packageLabel: path.basename(sourceFile),
      archives: [],
      integrityStatus: 'unknown',
      integrityIssues: [],
      errors,
      valid: false,
    };
  }
}

export async function executeMoarchImport(
  sessionId: string,
  options: MoarchImportOptions,
): Promise<MoarchImportResult> {
  const pending = pendingImports.get(sessionId);
  if (!pending) {
    throw new Error('Import session expired. Select the .moarch package again.');
  }

  if (options.duplicateAction === 'cancel') {
    await releaseMoarchImportSession(sessionId);
    return { imported: [], skipped: 0, cancelled: true };
  }

  const imported: MoarchImportResult['imported'] = [];
  let skipped = 0;
  let cleanupWarning: string | undefined;

  try {
    for (const preview of pending.previews) {
      if (preview.isDuplicate && options.duplicateAction === 'skip') {
        skipped += 1;
        continue;
      }

      const folderPath = resolveArchiveFolder(pending.extractPath, preview.folderKey);
      const archiveJson = readArchiveJson(folderPath);
      const record = archiveJson.archive;
      if (!record?.name) {
        skipped += 1;
        continue;
      }

      const archiveUUID = record.archive_uuid || preview.archiveUUID;
      const useSeparateUuid =
        preview.isDuplicate && options.duplicateAction === 'separate';

      const location = createLocation({
        archive_uuid: useSeparateUuid ? uuidv4() : archiveUUID || uuidv4(),
        origin_machine_id: record.origin_machine_id || '',
        map_signature: record.map_signature || preview.mapSignature || '',
        archive_id: '',
        archive_class: record.archive_class || 'structure_site',
        name: record.name,
        location_text: record.location_text || '',
        latitude: record.coordinates?.latitude ?? 0,
        longitude: record.coordinates?.longitude ?? 0,
        type: record.type || 'industrial',
        status: record.status || 'unknown',
        risk_level: record.risk_level || 'unknown',
        priority_override: record.priority_override || '',
        description: record.description || '',
        notes: record.notes || '',
        structural_notes: record.structural_notes || '',
        access_notes: record.access_notes || '',
        research_notes: record.research_notes || '',
        county: '',
        city: '',
        state: 'MO',
        tags: tagsToJson(Array.isArray(record.tags) ? record.tags.map(String) : []),
        media_folder: '',
        source_links: record.source_links || '',
        building_count: record.building_count ?? 0,
        coordinates_audited: record.coordinates?.audited ? 1 : 0,
        date_added: record.date_added,
        date_modified: record.date_modified,
      });

      for (const entry of archiveJson.timeline ?? []) {
        if (!entry.title?.trim()) continue;
        createTimelineEntry({
          location_id: location.id,
          category: entry.category || 'Historical',
          year: entry.year,
          title: entry.title,
          description: entry.description || '',
        });
      }

      const heroFile = archiveJson.media?.hero_image;
      if (heroFile) {
        const heroPath = path.join(folderPath, heroFile);
        if (fs.existsSync(heroPath)) {
          await addMediaFiles(location.id, [heroPath], 'site');
        }
      }

      const researchFiles = archiveJson.media?.research ?? [];
      const researchPaths = researchFiles
        .map((filename) => path.join(folderPath, 'research', filename))
        .filter((filePath) => fs.existsSync(filePath));
      if (researchPaths.length > 0) {
        await addMediaFiles(location.id, researchPaths, 'research');
      }

      imported.push({
        locationId: location.id,
        archiveId: location.archive_id,
        name: location.name,
      });
    }
  } finally {
    cleanupWarning = await releaseMoarchImportSession(sessionId);
  }

  return { imported, skipped, cancelled: false, cleanupWarning };
}

export async function cancelMoarchImport(sessionId: string): Promise<void> {
  await releaseMoarchImportSession(sessionId);
}

async function releaseMoarchImportSession(sessionId: string): Promise<string | undefined> {
  const pending = pendingImports.get(sessionId);
  if (!pending) return undefined;
  pendingImports.delete(sessionId);
  const result = await cleanupExtract(pending.extractPath);
  return result.warning;
}

function buildPreviews(extractPath: string, errors: string[]): MoarchArchivePreview[] {
  const manifestPath = path.join(extractPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push('Missing manifest.json.');
    return [];
  }

  let manifest: MoarchManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as MoarchManifest;
  } catch {
    errors.push('Invalid manifest.json.');
    return [];
  }

  if (typeof manifest.formatVersion !== 'number') {
    errors.push('Manifest missing formatVersion.');
  } else if (manifest.formatVersion > MOARCH_FORMAT_VERSION) {
    errors.push(`Unsupported .moarch format version (${manifest.formatVersion}).`);
  }

  if (manifest.packageType && manifest.packageType !== 'curated_archival_dossier') {
    errors.push(`Unexpected package type: ${manifest.packageType}`);
  }

  const entries = resolveManifestEntries(extractPath, manifest);
  if (entries.length === 0) {
    errors.push('No archive.json dossier records found in package.');
    return [];
  }

  const previews: MoarchArchivePreview[] = [];
  for (const entry of entries) {
    const folderPath = resolveArchiveFolder(extractPath, entry.folderKey);
    const archiveJsonPath = path.join(folderPath, 'archive.json');
    if (!fs.existsSync(archiveJsonPath)) {
      errors.push(`Missing archive.json for ${entry.folderKey || 'package root'}.`);
      continue;
    }

    let archiveJson: MoarchArchiveJson;
    try {
      archiveJson = JSON.parse(fs.readFileSync(archiveJsonPath, 'utf-8')) as MoarchArchiveJson;
    } catch {
      errors.push(`Invalid archive.json for ${entry.folderKey || 'package root'}.`);
      continue;
    }

    if (!archiveJson.archive?.name) {
      errors.push(`archive.json missing archive name in ${entry.folderKey || 'package root'}.`);
      continue;
    }

    const archiveUUID =
      archiveJson.archive.archive_uuid || entry.archiveUUID || manifest.archiveUUID || '';
    const existing = archiveUUID ? getLocationByArchiveUUID(archiveUUID) : null;

    previews.push({
      folderKey: entry.folderKey,
      archiveUUID,
      archiveId: archiveJson.archive.archive_id || entry.archiveId || '—',
      mapSignature:
        archiveJson.archive.map_signature ||
        entry.mapSignature ||
        manifest.mapSignature ||
        '',
      name: archiveJson.archive.name,
      hasHeroImage: Boolean(archiveJson.media?.hero_image),
      researchCount: archiveJson.media?.research?.length ?? entry.researchCount ?? 0,
      timelineCount: archiveJson.timeline?.length ?? 0,
      isDuplicate: Boolean(existing),
    });
  }

  return previews;
}

function resolveManifestEntries(
  extractPath: string,
  manifest: MoarchManifest,
): Array<{
  folderKey: string;
  archiveUUID?: string;
  archiveId?: string;
  mapSignature?: string;
  researchCount?: number;
}> {
  if (Array.isArray(manifest.archives) && manifest.archives.length > 0) {
    return manifest.archives.map((entry) => ({
      folderKey: entry.folder && entry.folder !== '.' ? entry.folder : '',
      archiveUUID: entry.archive_uuid,
      archiveId: entry.archive_id,
      mapSignature: entry.map_signature,
      researchCount: entry.research_count,
    }));
  }

  if (fs.existsSync(path.join(extractPath, 'archive.json'))) {
    return [{ folderKey: '' }];
  }

  return fs
    .readdirSync(extractPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => ({ folderKey: entry.name }))
    .filter((entry) => fs.existsSync(path.join(extractPath, entry.folderKey, 'archive.json')));
}

function resolveArchiveFolder(extractPath: string, folderKey: string): string {
  return folderKey ? path.join(extractPath, folderKey) : extractPath;
}

function readArchiveJson(folderPath: string): MoarchArchiveJson {
  return JSON.parse(fs.readFileSync(path.join(folderPath, 'archive.json'), 'utf-8')) as MoarchArchiveJson;
}

async function cleanupExtract(
  extractPath: string,
): Promise<{ removed: boolean; warning?: string }> {
  return cleanupTempPath(extractPath);
}

function sanitizeEntryName(name: string): string {
  const normalized = path.normalize(name).replace(/^(\.\.(\/|\\|$))+/, '');
  return normalized.replace(/^[/\\]+/, '');
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const zipfile = await openZip(zipPath);
  await new Promise<void>((resolve, reject) => {
    zipfile.on('error', reject);
    zipfile.on('entry', (entry) => {
      const safeName = sanitizeEntryName(entry.fileName);
      if (!safeName || safeName.includes('..')) {
        zipfile.readEntry();
        return;
      }

      const entryPath = path.join(destDir, safeName);
      if (/\/$/.test(entry.fileName)) {
        fs.mkdirSync(entryPath, { recursive: true });
        zipfile.readEntry();
        return;
      }

      fs.mkdirSync(path.dirname(entryPath), { recursive: true });
      zipfile.openReadStream(entry, (err, readStream) => {
        if (err || !readStream) {
          reject(err ?? new Error(`Unable to read ${entry.fileName}`));
          return;
        }
        pipeline(readStream, createWriteStream(entryPath))
          .then(() => zipfile.readEntry())
          .catch(reject);
      });
    });
    zipfile.on('end', () => resolve());
    zipfile.readEntry();
  });
  zipfile.close();
}

function openZip(filePath: string): Promise<yauzlType.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new Error('Unable to open .moarch package.'));
      else resolve(zipfile);
    });
  });
}

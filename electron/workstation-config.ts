import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type { AppSettings } from '../shared/types';

export interface WorkstationConfigFile {
  archiveRoot?: string;
  /** Optional maps directory override (portable / external drive workflows). */
  mapsRoot?: string;
  workstationInitialized?: boolean;
  settings?: Partial<AppSettings>;
}

const PORTABLE_DIR_NAME = 'MissouriUndergroundPortable';
const PORTABLE_MARKER = '.mo-portable';

/** Pre-onboarding default archive location. */
export const LEGACY_ARCHIVE_ROOT = path.join(
  app.getPath('documents'),
  'MissouriArchive',
  'archive',
);

let cachedArchiveRoot: string | null = null;

/** Future portable mode — self-contained layout beside the executable. */
export function getPortableBaseDir(): string | null {
  if (process.env.MO_UNDERGROUND_PORTABLE === '1') {
    return path.join(path.dirname(process.execPath), PORTABLE_DIR_NAME);
  }
  const marker = path.join(path.dirname(process.execPath), PORTABLE_MARKER);
  if (app.isPackaged && fs.existsSync(marker)) {
    return path.join(path.dirname(process.execPath), PORTABLE_DIR_NAME);
  }
  return null;
}

export function getWorkstationConfigDir(): string {
  const portable = getPortableBaseDir();
  if (portable) {
    return path.join(portable, 'config');
  }
  return app.getPath('userData');
}

export function getConfigFilePath(): string {
  return path.join(getWorkstationConfigDir(), 'config.json');
}

export function readWorkstationConfig(): WorkstationConfigFile {
  const configPath = getConfigFilePath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as WorkstationConfigFile;
  } catch {
    return {};
  }
}

export function writeWorkstationConfig(patch: Partial<WorkstationConfigFile>): WorkstationConfigFile {
  const configPath = getConfigFilePath();
  const existing = readWorkstationConfig();
  const next: WorkstationConfigFile = { ...existing, ...patch };
  if (patch.settings) {
    next.settings = { ...existing.settings, ...patch.settings };
  }
  if ('mapsRoot' in patch && patch.mapsRoot === undefined) {
    delete next.mapsRoot;
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  if (patch.archiveRoot !== undefined) {
    cachedArchiveRoot = patch.archiveRoot;
  }
  return next;
}

export function archiveHasEvidence(root: string): boolean {
  const normalized = root.trim();
  if (!normalized) return false;
  if (fs.existsSync(path.join(normalized, 'database.sqlite'))) return true;
  return listMbtilesInDirectory(path.join(normalized, 'maps')).length > 0;
}

export function discoverActiveArchiveRoot(): string | null {
  const config = readWorkstationConfig();
  const candidates = [
    config.archiveRoot?.trim(),
    LEGACY_ARCHIVE_ROOT,
    getDefaultArchiveRoot(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (archiveHasEvidence(normalized)) {
      return normalized;
    }
  }

  return config.archiveRoot?.trim() || null;
}

export function isWorkstationInitialized(): boolean {
  const config = readWorkstationConfig();
  const discovered = discoverActiveArchiveRoot();

  if (discovered && archiveHasEvidence(discovered)) {
    if (config.archiveRoot !== discovered || !config.workstationInitialized) {
      writeWorkstationConfig({ archiveRoot: discovered, workstationInitialized: true });
      cachedArchiveRoot = discovered;
    }
    return true;
  }

  if (config.workstationInitialized === true && Boolean(config.archiveRoot?.trim())) {
    return true;
  }

  if (config.archiveRoot?.trim()) {
    const dbPath = path.join(config.archiveRoot, 'database.sqlite');
    if (fs.existsSync(dbPath)) {
      writeWorkstationConfig({ workstationInitialized: true });
      return true;
    }
  }

  return false;
}

export function getDefaultArchiveRoot(): string {
  return path.join(app.getPath('documents'), 'Missouri Underground');
}

export function getDefaultMapsRoot(archiveRoot?: string): string {
  return path.join(archiveRoot ?? getDefaultArchiveRoot(), 'maps');
}

export function getConfiguredArchiveRoot(): string | null {
  const config = readWorkstationConfig();
  return config.archiveRoot?.trim() || null;
}

export function getConfiguredMapsRoot(): string | null {
  const config = readWorkstationConfig();
  return config.mapsRoot?.trim() || null;
}

export function resetArchiveRootCache(): void {
  cachedArchiveRoot = null;
}

export function resolveArchiveRoot(): string {
  if (cachedArchiveRoot) return cachedArchiveRoot;

  const discovered = discoverActiveArchiveRoot();
  if (discovered) {
    const config = readWorkstationConfig();
    if (config.archiveRoot !== discovered) {
      writeWorkstationConfig({ archiveRoot: discovered, workstationInitialized: true });
    }
    cachedArchiveRoot = discovered;
    return discovered;
  }

  const configured = getConfiguredArchiveRoot();
  if (configured) {
    cachedArchiveRoot = configured;
    return configured;
  }

  cachedArchiveRoot = getDefaultArchiveRoot();
  return cachedArchiveRoot;
}

export function resolveMapsRoot(archiveRoot: string): string {
  const canonicalMaps = path.join(archiveRoot, 'maps');
  const configured = getConfiguredMapsRoot();

  if (listMbtilesInDirectory(canonicalMaps).length > 0) {
    if (configured && path.normalize(configured) !== path.normalize(canonicalMaps)) {
      writeWorkstationConfig({ mapsRoot: undefined });
    }
    return canonicalMaps;
  }

  if (configured && listMbtilesInDirectory(configured).length > 0) {
    return configured;
  }

  return canonicalMaps;
}

export function listMbtilesInDirectory(mapsDir: string): string[] {
  if (!fs.existsSync(mapsDir)) return [];
  return fs
    .readdirSync(mapsDir)
    .filter((name) => name.toLowerCase().endsWith('.mbtiles'))
    .map((name) => path.join(mapsDir, name));
}

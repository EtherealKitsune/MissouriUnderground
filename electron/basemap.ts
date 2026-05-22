import Database from 'better-sqlite3';
import { dialog, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type { BasemapInstallProgress, BasemapInstallResult, MapStatus } from '../shared/types';
import { ensureArchiveStructure } from './archive-path';
import { getBasemapInfo, persistActiveBasemap } from './basemap-resolve';
import { initMbtiles } from './mbtiles';

export { getBasemapInfo, persistActiveBasemap, resolveActiveBasemapPath } from './basemap-resolve';

const INVALID_MBTILES_MESSAGE =
  'The selected file does not appear to contain a valid MBTiles database.';

const INCOMPLETE_METADATA_WARNING =
  'Basemap metadata appears incomplete, but the tileset may still function.';

export interface MbtilesValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

function quoteSqliteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function listUserTables(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'",
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function hasTileStorage(db: Database.Database, tableNames: string[]): boolean {
  if (tableNames.some((name) => name.toLowerCase() === 'tiles')) {
    return true;
  }

  for (const name of tableNames) {
    try {
      const columns = db
        .prepare(`PRAGMA table_info(${quoteSqliteIdent(name)})`)
        .all() as Array<{ name: string }>;
      if (columns.some((column) => column.name.toLowerCase() === 'tile_data')) {
        return true;
      }
    } catch {
      // Best-effort inspection only.
    }
  }

  return false;
}

function collectMetadataWarnings(db: Database.Database, tableNames: string[]): string[] {
  if (!tableNames.some((name) => name.toLowerCase() === 'metadata')) {
    return [INCOMPLETE_METADATA_WARNING];
  }

  try {
    const row = db.prepare('SELECT name, value FROM metadata LIMIT 1').get();
    return row ? [] : [INCOMPLETE_METADATA_WARNING];
  } catch {
    return [INCOMPLETE_METADATA_WARNING];
  }
}

export function validateMbtilesFile(filePath: string): MbtilesValidationResult {
  if (!filePath?.trim() || !fs.existsSync(filePath)) {
    return { valid: false, error: INVALID_MBTILES_MESSAGE };
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true });
  } catch {
    return { valid: false, error: INVALID_MBTILES_MESSAGE };
  }

  try {
    const tableNames = listUserTables(db);
    if (!hasTileStorage(db, tableNames)) {
      return { valid: false, error: INVALID_MBTILES_MESSAGE };
    }

    const warnings = collectMetadataWarnings(db, tableNames);
    return warnings.length > 0 ? { valid: true, warnings } : { valid: true };
  } catch {
    return { valid: false, error: INVALID_MBTILES_MESSAGE };
  } finally {
    db?.close();
  }
}

function emitProgress(sender: WebContents, progress: BasemapInstallProgress): void {
  sender.send('map:install-progress', progress);
}

async function copyFileWithProgress(
  sourcePath: string,
  destPath: string,
  filename: string,
  sender: WebContents,
): Promise<void> {
  const totalBytes = fs.statSync(sourcePath).size;

  await new Promise<void>((resolve, reject) => {
    let copiedBytes = 0;
    const readStream = fs.createReadStream(sourcePath);
    const writeStream = fs.createWriteStream(destPath);

    const report = () => {
      emitProgress(sender, {
        filename,
        totalBytes,
        copiedBytes,
        stage: 'copying',
      });
    };

    readStream.on('data', (chunk: Buffer | string) => {
      copiedBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      report();
    });

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);
    readStream.pipe(writeStream);
    report();
  });
}

export async function pickBasemapFile(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import .mbtiles basemap',
    properties: ['openFile'],
    filters: [{ name: 'MBTiles', extensions: ['mbtiles'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

export async function installBasemap(
  sourcePath: string,
  sender: WebContents,
): Promise<BasemapInstallResult> {
  const filename = path.basename(sourcePath);

  emitProgress(sender, {
    filename,
    totalBytes: 0,
    copiedBytes: 0,
    stage: 'validating',
  });

  const validation = validateMbtilesFile(sourcePath);
  if (!validation.valid) {
    emitProgress(sender, {
      filename,
      totalBytes: 0,
      copiedBytes: 0,
      stage: 'error',
      message: validation.error ?? INVALID_MBTILES_MESSAGE,
    });
    return { success: false, error: validation.error ?? INVALID_MBTILES_MESSAGE };
  }

  const paths = ensureArchiveStructure();
  fs.mkdirSync(paths.maps, { recursive: true });
  const destPath = path.join(paths.maps, filename);

  try {
    await copyFileWithProgress(sourcePath, destPath, filename, sender);
    persistActiveBasemap(destPath);
    const mapStatus = initMbtiles();

    emitProgress(sender, {
      filename,
      totalBytes: fs.statSync(destPath).size,
      copiedBytes: fs.statSync(destPath).size,
      stage: 'complete',
    });

    return { success: true, mapStatus, installedPath: destPath, warning: validation.warnings?.[0] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Basemap installation failed.';
    emitProgress(sender, {
      filename,
      totalBytes: 0,
      copiedBytes: 0,
      stage: 'error',
      message,
    });
    return { success: false, error: message };
  }
}

export async function installBasemapInteractive(sender: WebContents): Promise<BasemapInstallResult> {
  const picked = await pickBasemapFile();
  if (!picked) {
    return { success: false, error: 'cancelled' };
  }
  return installBasemap(picked, sender);
}

export function reloadBasemaps(): MapStatus {
  return initMbtiles();
}

export function openMapsFolder(): string {
  const paths = ensureArchiveStructure();
  fs.mkdirSync(paths.maps, { recursive: true });
  void shell.openPath(paths.maps);
  return paths.maps;
}

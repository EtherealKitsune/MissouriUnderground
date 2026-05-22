import fs from 'node:fs';
import path from 'node:path';

import type { BackupInfo } from '../shared/types';
import { getArchivePaths } from './archive-path';
import { closeDatabase, initDatabase } from './database';

const MAX_AUTO_BACKUPS = 10;

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackupInterval(): void {
  if (autoBackupTimer) return;
  autoBackupTimer = setInterval(() => createBackup(false), 6 * 60 * 60 * 1000);
}

export function stopAutoBackupInterval(): void {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
}

export function createBackup(manual = false): BackupInfo {
  const paths = getArchivePaths();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = manual ? 'manual' : 'auto';
  const backupName = `${prefix}-${timestamp}`;
  const backupDir = path.join(paths.backups, backupName);

  fs.mkdirSync(backupDir, { recursive: true });

  // Checkpoint WAL and copy database
  closeDatabase();
  const db = initDatabase();
  db.pragma('wal_checkpoint(TRUNCATE)');

  if (fs.existsSync(paths.database)) {
    fs.copyFileSync(paths.database, path.join(backupDir, 'database.sqlite'));
  }

  // Copy media folder structure (shallow manifest for large archives)
  const mediaManifest = listMediaManifest(paths.media);
  fs.writeFileSync(path.join(backupDir, 'media-manifest.json'), JSON.stringify(mediaManifest, null, 2));

  const info: BackupInfo = {
    filename: backupName,
    path: backupDir,
    created: new Date().toISOString(),
    size: dirSize(backupDir),
  };

  fs.writeFileSync(path.join(backupDir, 'backup-info.json'), JSON.stringify(info, null, 2));

  if (!manual) {
    pruneAutoBackups(paths.backups);
  }

  return info;
}

function listMediaManifest(mediaRoot: string): { path: string; size: number }[] {
  const manifest: { path: string; size: number }[] = [];
  if (!fs.existsSync(mediaRoot)) return manifest;

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const stat = fs.statSync(full);
        manifest.push({ path: path.relative(mediaRoot, full), size: stat.size });
      }
    }
  }
  walk(mediaRoot);
  return manifest;
}

function dirSize(dir: string): number {
  let size = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    size += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return size;
}

function pruneAutoBackups(backupsDir: string): void {
  if (!fs.existsSync(backupsDir)) return;
  const autoBackups = fs
    .readdirSync(backupsDir)
    .filter((name) => name.startsWith('auto-'))
    .map((name) => ({
      name,
      path: path.join(backupsDir, name),
      mtime: fs.statSync(path.join(backupsDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const backup of autoBackups.slice(MAX_AUTO_BACKUPS)) {
    fs.rmSync(backup.path, { recursive: true, force: true });
  }
}

export function listBackups(): BackupInfo[] {
  const { backups } = getArchivePaths();
  if (!fs.existsSync(backups)) return [];

  return fs
    .readdirSync(backups, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const infoPath = path.join(backups, e.name, 'backup-info.json');
      if (fs.existsSync(infoPath)) {
        return JSON.parse(fs.readFileSync(infoPath, 'utf-8')) as BackupInfo;
      }
      const backupPath = path.join(backups, e.name);
      return {
        filename: e.name,
        path: backupPath,
        created: fs.statSync(backupPath).mtime.toISOString(),
        size: dirSize(backupPath),
      };
    })
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

export function restoreBackup(backupName: string): void {
  const paths = getArchivePaths();
  const backupDir = path.join(paths.backups, backupName);
  const backupDb = path.join(backupDir, 'database.sqlite');

  if (!fs.existsSync(backupDb)) {
    throw new Error('Backup database not found');
  }

  closeDatabase();

  // Safety copy of current DB before restore
  if (fs.existsSync(paths.database)) {
    const safetyPath = `${paths.database}.pre-restore-${Date.now()}`;
    fs.copyFileSync(paths.database, safetyPath);
  }

  fs.copyFileSync(backupDb, paths.database);
  initDatabase();
}

export function exportFullArchiveBackup(destPath: string): string {
  const paths = getArchivePaths();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = destPath || path.join(paths.exports, `full-backup-${timestamp}`);

  fs.mkdirSync(target, { recursive: true });

  if (fs.existsSync(paths.database)) {
    fs.copyFileSync(paths.database, path.join(target, 'database.sqlite'));
  }

  copyDir(paths.media, path.join(target, 'media'));
  return target;
}

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

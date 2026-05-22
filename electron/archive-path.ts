import fs from 'node:fs';
import path from 'node:path';

import type { ArchivePaths } from '../shared/types';
import {
  getConfiguredMapsRoot,
  getDefaultArchiveRoot,
  readWorkstationConfig,
  resetArchiveRootCache,
  resolveArchiveRoot,
  resolveMapsRoot,
  writeWorkstationConfig,
} from './workstation-config';

export { getDefaultArchiveRoot } from './workstation-config';

export function getArchiveRoot(): string {
  return resolveArchiveRoot();
}

export function setArchiveRoot(root: string): ArchivePaths {
  resetArchiveRootCache();
  writeWorkstationConfig({ archiveRoot: root, workstationInitialized: true });
  return ensureArchiveStructure(root);
}

export function ensureArchiveStructure(root?: string): ArchivePaths {
  const base = root ?? getArchiveRoot();
  const maps = getConfiguredMapsRoot() ?? path.join(base, 'maps');
  const paths: ArchivePaths = {
    root: base,
    database: path.join(base, 'database.sqlite'),
    media: path.join(base, 'media'),
    exports: path.join(base, 'exports'),
    backups: path.join(base, 'backups'),
    maps,
  };

  for (const dir of [paths.root, paths.media, paths.exports, paths.backups, paths.maps]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return paths;
}

export function getArchivePaths(): ArchivePaths {
  const base = getArchiveRoot();
  const maps = resolveMapsRoot(base);
  return {
    root: base,
    database: path.join(base, 'database.sqlite'),
    media: path.join(base, 'media'),
    exports: path.join(base, 'exports'),
    backups: path.join(base, 'backups'),
    maps,
  };
}

/** @deprecated Use workstation-config helpers directly. */
export function getLegacyArchiveRootFromConfig(): string | undefined {
  return readWorkstationConfig().archiveRoot;
}
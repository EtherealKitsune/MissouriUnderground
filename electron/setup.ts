import fs from 'node:fs';
import path from 'node:path';

import { LAYOUT_PRESETS, type WorkstationLayoutPreset } from '../shared/workstation-layout';
import { ensureArchiveStructure, getArchivePaths, setArchiveRoot } from './archive-path';
import { initDatabase } from './database';
import { getMapStatus, initMbtiles } from './mbtiles';
import { loadSettings, saveSettings } from './settings';
import {
  discoverActiveArchiveRoot,
  getDefaultArchiveRoot,
  getDefaultMapsRoot,
  isWorkstationInitialized,
  listMbtilesInDirectory,
  writeWorkstationConfig,
} from './workstation-config';

export interface WorkstationSetupDefaults {
  needsSetup: boolean;
  defaultArchiveRoot: string;
  defaultMapsRoot: string;
  detectedMbtiles: string[];
}

export interface WorkstationSetupInput {
  archiveRoot: string;
  mapSignature: string;
  layoutPreset: WorkstationLayoutPreset;
  mapsRoot?: string;
  initializeMapsFolder?: boolean;
}

export function getWorkstationSetupDefaults(): WorkstationSetupDefaults {
  const discovered = discoverActiveArchiveRoot();
  const defaultArchiveRoot = discovered ?? getDefaultArchiveRoot();
  const defaultMapsRoot = getDefaultMapsRoot(defaultArchiveRoot);

  return {
    needsSetup: !isWorkstationInitialized(),
    defaultArchiveRoot,
    defaultMapsRoot,
    detectedMbtiles: listMbtilesInDirectory(defaultMapsRoot),
  };
}

export function scanMapsDirectory(mapsDir: string): string[] {
  return listMbtilesInDirectory(mapsDir);
}

export function completeWorkstationSetup(input: WorkstationSetupInput) {
  const archiveRoot = input.archiveRoot.trim();
  if (!archiveRoot) {
    throw new Error('Archive storage location is required.');
  }

  fs.mkdirSync(archiveRoot, { recursive: true });
  const canonicalMaps = getDefaultMapsRoot(archiveRoot);
  const requestedMapsRoot = input.mapsRoot?.trim();
  const persistMapsRoot =
    requestedMapsRoot &&
    input.initializeMapsFolder !== false &&
    path.normalize(requestedMapsRoot) !== path.normalize(canonicalMaps);

  if (input.initializeMapsFolder !== false) {
    fs.mkdirSync(persistMapsRoot ? requestedMapsRoot! : canonicalMaps, { recursive: true });
  }

  writeWorkstationConfig({
    archiveRoot,
    mapsRoot: persistMapsRoot ? requestedMapsRoot : undefined,
    workstationInitialized: true,
  });

  setArchiveRoot(archiveRoot);

  const preset = LAYOUT_PRESETS[input.layoutPreset] ?? LAYOUT_PRESETS.standard;
  const existing = loadSettings();
  saveSettings({
    ...existing,
    mapSignature: input.mapSignature.trim(),
    layoutPreset: input.layoutPreset,
    sidebarWidth: preset.sidebarWidth,
    dossierWidth: preset.dossierWidth,
  });

  ensureArchiveStructure(archiveRoot);
  initDatabase();
  initMbtiles();

  return {
    paths: getArchivePaths(),
    mapStatus: getMapStatus(),
    settings: loadSettings(),
  };
}

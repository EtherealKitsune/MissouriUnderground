import fs from 'node:fs';
import path from 'node:path';

import type { BasemapInfo } from '../shared/types';
import { ensureArchiveStructure } from './archive-path';
import { loadSettings, saveSettings } from './settings';

export function listBasemapFilenames(mapsDir: string): string[] {
  if (!fs.existsSync(mapsDir)) return [];
  return fs
    .readdirSync(mapsDir)
    .filter((name) => name.toLowerCase().endsWith('.mbtiles'))
    .sort((a, b) => a.localeCompare(b));
}

export function resolveActiveBasemapPath(): string | null {
  const paths = ensureArchiveStructure();
  const mapsDir = paths.maps;
  fs.mkdirSync(mapsDir, { recursive: true });

  const active = loadSettings().activeBasemap?.trim();
  if (!active) return null;

  const files = listBasemapFilenames(mapsDir);
  const match = files.find((name) => name.toLowerCase() === active.toLowerCase());
  if (!match) return null;

  return path.join(mapsDir, match);
}

export function persistActiveBasemap(filePath: string | null): void {
  const filename = filePath ? path.basename(filePath) : undefined;
  const settings = loadSettings();
  saveSettings({ ...settings, activeBasemap: filename });
}

export function getBasemapInfo(): BasemapInfo {
  const paths = ensureArchiveStructure();
  const settings = loadSettings();
  const availableBasemaps = listBasemapFilenames(paths.maps);
  const active = settings.activeBasemap?.trim() ?? null;
  const activeExists = active
    ? availableBasemaps.some((name) => name.toLowerCase() === active.toLowerCase())
    : false;

  return {
    activeBasemap: activeExists ? active : null,
    mapsFolder: paths.maps,
    mapsFolderLabel: 'archive/maps/',
    availableBasemaps,
  };
}

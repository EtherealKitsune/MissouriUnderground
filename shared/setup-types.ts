import type { ArchivePaths, AppSettings, MapStatus } from './types';
import type { WorkstationLayoutPreset } from './workstation-layout';

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

export interface WorkstationInitResult {
  needsSetup: boolean;
  paths: ArchivePaths | null;
  mapStatus: MapStatus | null;
  settings: AppSettings;
  setupDefaults: WorkstationSetupDefaults;
}

/** Shared types between main and renderer processes */

import type { ArchiveClass, SiteType, TimelineCategory } from './archive-meta';
import type { WorkstationLayoutPreset } from './workstation-layout';

export type LocationType = SiteType | string;

export type LocationStatus =
  | 'active'
  | 'demolished'
  | 'inaccessible'
  | 'unknown'
  | 'monitored';

export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme' | 'unknown';

export interface Location {
  id: string;
  archive_uuid: string;
  archive_id: string;
  origin_machine_id: string;
  map_signature: string;
  archive_class: ArchiveClass | string;
  name: string;
  location_text: string;
  latitude: number;
  longitude: number;
  type: LocationType;
  status: LocationStatus | string;
  risk_level: RiskLevel | string;
  priority_override: string;
  description: string;
  notes: string;
  structural_notes: string;
  access_notes: string;
  research_notes: string;
  county: string;
  city: string;
  state: string;
  date_added: string;
  date_modified: string;
  tags: string;
  media_folder: string;
  source_links: string;
  building_count: number;
  coordinates_audited: number;
}

export type LocationInput = Omit<
  Location,
  'id' | 'archive_uuid' | 'origin_machine_id' | 'map_signature' | 'date_added' | 'date_modified'
> & {
  id?: string;
  archive_uuid?: string;
  origin_machine_id?: string;
  map_signature?: string;
  date_added?: string;
  date_modified?: string;
};

export interface LocationFilters {
  search?: string;
  county?: string;
  city?: string;
  tags?: string[];
  type?: string;
  status?: string;
  risk_level?: string;
  archive_class?: string;
  date_from?: string;
  date_to?: string;
  /** When false, non-historical filter still dims non-matching pins on map. */
  showHistorical?: boolean;
}

export interface TimelineEntry {
  id: string;
  location_id: string;
  category: TimelineCategory | string;
  year: number;
  title: string;
  description: string;
}

export type TimelineInput = Omit<TimelineEntry, 'id'>;

/** Resolved dossier reference — navigation uses locationId; archiveUUID is the canonical identity. */
export interface ArchiveReferenceTarget {
  locationId: string;
  archiveUUID: string;
  archiveId: string;
  name: string;
}

export interface ArchivePaths {
  root: string;
  database: string;
  media: string;
  exports: string;
  backups: string;
  maps: string;
}

export interface MapStatus {
  hasTiles: boolean;
  mbtilesPath: string | null;
  tileFormat: 'vector' | 'raster' | null;
  sourceLayers?: string[];
  minZoom?: number;
  maxZoom?: number;
  tileContentType?: string;
  basemapFilename?: string | null;
}

export interface BasemapInfo {
  activeBasemap: string | null;
  mapsFolder: string;
  mapsFolderLabel: string;
  availableBasemaps: string[];
}

export interface BasemapInstallProgress {
  filename: string;
  totalBytes: number;
  copiedBytes: number;
  stage: 'validating' | 'copying' | 'complete' | 'error';
  message?: string;
}

export interface BasemapInstallResult {
  success: boolean;
  error?: string;
  warning?: string;
  mapStatus?: MapStatus;
  installedPath?: string;
}

export interface MediaFile {
  name: string;
  path: string;
  thumbnailPath?: string;
  type: 'image' | 'video' | 'other';
  scope?: 'site' | 'research';
  durationSeconds?: number;
}

export interface MediaImportProgress {
  locationId: string;
  scope: 'site' | 'research';
  total: number;
  current: number;
  stage: 'importing' | 'thumbnailing' | 'metadata' | 'complete';
  filename?: string;
}

export type ExportFormat = 'gpx' | 'kml' | 'geojson' | 'csv';

export interface ExportProgress {
  total: number;
  current: number;
  stage: string;
  status: 'running' | 'complete' | 'error';
  path?: string;
}

export interface BackupInfo {
  filename: string;
  path: string;
  created: string;
  size: number;
}

export type MoarchIntegrityStatus = 'verified' | 'modified' | 'incomplete' | 'unknown';

export type MoarchDuplicateAction = 'skip' | 'separate' | 'cancel';

export interface MoarchArchivePreview {
  folderKey: string;
  archiveUUID: string;
  archiveId: string;
  mapSignature: string;
  name: string;
  hasHeroImage: boolean;
  researchCount: number;
  timelineCount: number;
  isDuplicate: boolean;
}

export interface MoarchImportPreview {
  sessionId: string;
  sourceFile: string;
  packageLabel: string;
  archives: MoarchArchivePreview[];
  integrityStatus: MoarchIntegrityStatus;
  integrityIssues: string[];
  errors: string[];
  valid: boolean;
}

export interface MoarchImportOptions {
  duplicateAction: MoarchDuplicateAction;
}

export interface MoarchImportResult {
  imported: Array<{ locationId: string; archiveId: string; name: string }>;
  skipped: number;
  cancelled: boolean;
  cleanupWarning?: string;
}

export type MediaImportMode = 'move' | 'copy';

export interface TrustedSignature {
  machineId: string;
  signature: string;
}

export interface AppSettings {
  mediaImportMode: MediaImportMode;
  showHistoricalPins: boolean;
  pinScale: number;
  currentMachineId: string;
  mapSignature: string;
  trustedSignatures: TrustedSignature[];
  /** Workstation-local panel widths (px). Not included in `.moarch`. */
  sidebarWidth: number;
  dossierWidth: number;
  layoutPreset?: WorkstationLayoutPreset;
  /** Active basemap filename in archive/maps/ (workstation-local). */
  activeBasemap?: string;
}

export const UNKNOWN_ARCHIVE_ORIGIN = 'Unknown Archive Origin';

export const DEFAULT_SETTINGS: AppSettings = {
  mediaImportMode: 'move',
  showHistoricalPins: true,
  pinScale: 1,
  currentMachineId: '',
  mapSignature: '',
  trustedSignatures: [],
  sidebarWidth: 300,
  dossierWidth: 380,
};

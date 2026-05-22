import type {
  AppSettings,
  ArchivePaths,
  ArchiveReferenceTarget,
  BackupInfo,
  ExportFormat,
  ExportProgress,
  Location,
  LocationFilters,
  LocationInput,
  BasemapInfo,
  BasemapInstallProgress,
  BasemapInstallResult,
  MapStatus,
  MediaFile,
  MediaImportProgress,
  MoarchImportOptions,
  MoarchImportPreview,
  MoarchImportResult,
  TimelineEntry,
  TimelineInput,
} from './types';
import type {
  WorkstationInitResult,
  WorkstationSetupDefaults,
  WorkstationSetupInput,
} from './setup-types';

/** Renderer-facing API exposed on window.moArchive via contextBridge */
export interface MoArchiveApi {
  init: () => Promise<WorkstationInitResult>;

  setup: {
    getDefaults: () => Promise<WorkstationSetupDefaults>;
    pickDirectory: (title: string, defaultPath?: string) => Promise<string | null>;
    scanMapsDirectory: (mapsDir: string) => Promise<string[]>;
    complete: (input: WorkstationSetupInput) => Promise<Omit<WorkstationInitResult, 'needsSetup'>>;
  };

  archive: {
    getPaths: () => Promise<ArchivePaths>;
    getRoot: () => Promise<string>;
    chooseRoot: () => Promise<ArchivePaths | null>;
    openFolder: () => Promise<string>;
  };

  locations: {
    list: (filters?: LocationFilters) => Promise<Location[]>;
    get: (id: string) => Promise<Location | null>;
    resolveReference: (archiveId: string) => Promise<ArchiveReferenceTarget | null>;
    create: (input: LocationInput) => Promise<Location>;
    update: (id: string, input: Partial<LocationInput>) => Promise<Location | null>;
    delete: (id: string) => Promise<boolean>;
    distinct: (field: 'archive_class' | 'county' | 'city' | 'type' | 'status' | 'risk_level') => Promise<string[]>;
    allTags: () => Promise<string[]>;
    tagsToJson: (tags: string[]) => Promise<string>;
  };

  timeline: {
    list: (locationId: string) => Promise<TimelineEntry[]>;
    create: (input: TimelineInput) => Promise<TimelineEntry>;
    update: (id: string, input: Partial<TimelineInput>) => Promise<TimelineEntry | null>;
    delete: (id: string) => Promise<boolean>;
  };

  map: {
    status: () => Promise<MapStatus>;
    info: () => Promise<BasemapInfo>;
    reload: () => Promise<MapStatus>;
    installBasemap: () => Promise<BasemapInstallResult>;
    openMapsFolder: () => Promise<string>;
    onInstallProgress: (callback: (progress: BasemapInstallProgress) => void) => () => void;
  };

  media: {
    list: (locationId: string, scope?: 'site' | 'research') => Promise<MediaFile[]>;
    add: (locationId: string, paths: string[], scope?: 'site' | 'research') => Promise<MediaFile[]>;
    delete: (locationId: string, filename: string, scope?: 'site' | 'research') => Promise<boolean>;
    openFolder: (locationId: string, scope?: 'site' | 'research') => Promise<void>;
    openFile: (filePath: string) => Promise<string>;
    fileUrl: (filePath: string) => Promise<string | null>;
    pickFiles: () => Promise<string[]>;
    dataUrl: (filePath: string) => Promise<string | null>;
    onImportProgress: (callback: (progress: MediaImportProgress) => void) => () => void;
  };

  export: {
    run: (format: ExportFormat, ids?: string[]) => Promise<string>;
    package: (ids?: string[], heroMediaIds?: Record<string, string | undefined>) => Promise<string>;
    openFolder: () => Promise<string>;
    onProgress: (callback: (progress: ExportProgress) => void) => () => void;
  };

  import: {
    prepareMoarch: () => Promise<MoarchImportPreview | null>;
    executeMoarch: (sessionId: string, options: MoarchImportOptions) => Promise<MoarchImportResult>;
    cancelMoarch: (sessionId: string) => Promise<void>;
  };

  backup: {
    create: (manual?: boolean) => Promise<BackupInfo>;
    list: () => Promise<BackupInfo[]>;
    restore: (name: string) => Promise<void>;
    exportFull: (dest?: string) => Promise<string | null>;
    openFolder: () => Promise<string>;
  };

  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: AppSettings) => Promise<AppSettings>;
  };

  onMenu: (channel: string, callback: (payload: unknown) => void) => () => void;
}

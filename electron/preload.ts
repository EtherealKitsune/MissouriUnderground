import { contextBridge, ipcRenderer } from 'electron';

import type {
  AppSettings,
  ArchivePaths,
  ArchiveReferenceTarget,
  BackupInfo,
  BasemapInfo,
  BasemapInstallProgress,
  BasemapInstallResult,
  ExportFormat,
  ExportProgress,
  Location,
  LocationFilters,
  LocationInput,
  MapStatus,
  MediaFile,
  MediaImportProgress,
  MoarchImportOptions,
  MoarchImportPreview,
  MoarchImportResult,
  TimelineEntry,
  TimelineInput,
} from '../shared/types';
import type {
  WorkstationInitResult,
  WorkstationSetupDefaults,
  WorkstationSetupInput,
} from '../shared/setup-types';

/**
 * Preload bridge — keep this file free of Node-only APIs beyond electron.
 * Built as CommonJS (preload.cjs) for sandbox + contextIsolation compatibility.
 */
const api = {
  init: (): Promise<WorkstationInitResult> => ipcRenderer.invoke('app:init'),

  setup: {
    getDefaults: (): Promise<WorkstationSetupDefaults> => ipcRenderer.invoke('app:getSetupDefaults'),
    pickDirectory: (title: string, defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke('app:pickSetupDirectory', title, defaultPath),
    scanMapsDirectory: (mapsDir: string): Promise<string[]> =>
      ipcRenderer.invoke('app:scanMapsDirectory', mapsDir),
    complete: (input: WorkstationSetupInput): Promise<Omit<WorkstationInitResult, 'needsSetup'>> =>
      ipcRenderer.invoke('app:completeSetup', input),
  },

  archive: {
    getPaths: (): Promise<ArchivePaths> => ipcRenderer.invoke('archive:getPaths'),
    getRoot: (): Promise<string> => ipcRenderer.invoke('archive:getRoot'),
    chooseRoot: (): Promise<ArchivePaths | null> => ipcRenderer.invoke('archive:chooseRoot'),
    openFolder: (): Promise<string> => ipcRenderer.invoke('archive:openFolder'),
  },

  locations: {
    list: (filters?: LocationFilters): Promise<Location[]> =>
      ipcRenderer.invoke('locations:list', filters ?? {}),
    get: (id: string): Promise<Location | null> => ipcRenderer.invoke('locations:get', id),
    resolveReference: (archiveId: string): Promise<ArchiveReferenceTarget | null> =>
      ipcRenderer.invoke('locations:resolveReference', archiveId),
    create: (input: LocationInput): Promise<Location> =>
      ipcRenderer.invoke('locations:create', input),
    update: (id: string, input: Partial<LocationInput>): Promise<Location | null> =>
      ipcRenderer.invoke('locations:update', id, input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('locations:delete', id),
    distinct: (
      field: 'archive_class' | 'county' | 'city' | 'type' | 'status' | 'risk_level',
    ): Promise<string[]> => ipcRenderer.invoke('locations:distinct', field),
    allTags: (): Promise<string[]> => ipcRenderer.invoke('locations:tags'),
    tagsToJson: (tags: string[]): Promise<string> =>
      ipcRenderer.invoke('locations:tagsToJson', tags),
  },

  timeline: {
    list: (locationId: string): Promise<TimelineEntry[]> =>
      ipcRenderer.invoke('timeline:list', locationId),
    create: (input: TimelineInput): Promise<TimelineEntry> =>
      ipcRenderer.invoke('timeline:create', input),
    update: (id: string, input: Partial<TimelineInput>): Promise<TimelineEntry | null> =>
      ipcRenderer.invoke('timeline:update', id, input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('timeline:delete', id),
  },

  map: {
    status: (): Promise<MapStatus> => ipcRenderer.invoke('map:status'),
    info: (): Promise<BasemapInfo> => ipcRenderer.invoke('map:info'),
    reload: (): Promise<MapStatus> => ipcRenderer.invoke('map:reload'),
    installBasemap: (): Promise<BasemapInstallResult> =>
      ipcRenderer.invoke('map:installBasemap'),
    openMapsFolder: (): Promise<string> => ipcRenderer.invoke('map:openMapsFolder'),
    onInstallProgress: (callback: (progress: BasemapInstallProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: BasemapInstallProgress) =>
        callback(progress);
      ipcRenderer.on('map:install-progress', handler);
      return () => ipcRenderer.removeListener('map:install-progress', handler);
    },
  },

  media: {
    list: (locationId: string, scope?: 'site' | 'research'): Promise<MediaFile[]> =>
      ipcRenderer.invoke('media:list', locationId, scope),
    add: (locationId: string, paths: string[], scope?: 'site' | 'research'): Promise<MediaFile[]> =>
      ipcRenderer.invoke('media:add', locationId, paths, scope),
    delete: (locationId: string, filename: string, scope?: 'site' | 'research'): Promise<boolean> =>
      ipcRenderer.invoke('media:delete', locationId, filename, scope),
    openFolder: (locationId: string, scope?: 'site' | 'research'): Promise<void> =>
      ipcRenderer.invoke('media:openFolder', locationId, scope),
    openFile: (filePath: string): Promise<string> => ipcRenderer.invoke('media:openFile', filePath),
    fileUrl: (filePath: string): Promise<string | null> => ipcRenderer.invoke('media:fileUrl', filePath),
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke('media:pickFiles'),
    dataUrl: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke('media:dataUrl', filePath),
    onImportProgress: (callback: (progress: MediaImportProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: MediaImportProgress) =>
        callback(progress);
      ipcRenderer.on('media:import-progress', handler);
      return () => ipcRenderer.removeListener('media:import-progress', handler);
    },
  },

  export: {
    run: (format: ExportFormat, ids?: string[]): Promise<string> =>
      ipcRenderer.invoke('export:run', format, ids),
    package: (ids?: string[], heroMediaIds?: Record<string, string | undefined>): Promise<string> =>
      ipcRenderer.invoke('export:package', ids, heroMediaIds),
    openFolder: (): Promise<string> => ipcRenderer.invoke('export:openFolder'),
    onProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ExportProgress) =>
        callback(progress);
      ipcRenderer.on('export:progress', handler);
      return () => ipcRenderer.removeListener('export:progress', handler);
    },
  },

  import: {
    prepareMoarch: (): Promise<MoarchImportPreview | null> =>
      ipcRenderer.invoke('import:prepareMoarch'),
    executeMoarch: (sessionId: string, options: MoarchImportOptions): Promise<MoarchImportResult> =>
      ipcRenderer.invoke('import:executeMoarch', sessionId, options),
    cancelMoarch: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('import:cancelMoarch', sessionId),
  },

  backup: {
    create: (manual?: boolean): Promise<BackupInfo> =>
      ipcRenderer.invoke('backup:create', manual),
    list: (): Promise<BackupInfo[]> => ipcRenderer.invoke('backup:list'),
    restore: (name: string): Promise<void> => ipcRenderer.invoke('backup:restore', name),
    exportFull: (dest?: string): Promise<string | null> =>
      ipcRenderer.invoke('backup:exportFull', dest),
    openFolder: (): Promise<string> => ipcRenderer.invoke('backup:openFolder'),
  },

  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:save', settings),
  },

  onMenu: (channel: string, callback: (payload: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
};

contextBridge.exposeInMainWorld('moArchive', api);

import { dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';

import type {
  AppSettings,
  ExportFormat,
  LocationFilters,
  LocationInput,
  MoarchImportOptions,
  TimelineInput,
} from '../shared/types';
import {
  ensureArchiveStructure,
  getArchivePaths,
  getArchiveRoot,
  setArchiveRoot,
} from './archive-path';
import {
  createBackup,
  exportFullArchiveBackup,
  listBackups,
  restoreBackup,
  startAutoBackupInterval,
} from './backup';
import {
  createLocation,
  deleteLocation,
  getAllTags,
  getDistinctValues,
  getLocation,
  getLocationByArchiveId,
  initDatabase,
  listLocations,
  tagsToJson,
  updateLocation,
} from './database';
import { exportArchivePackage, exportLocations } from './export';
import {
  cancelMoarchImport,
  executeMoarchImport,
  prepareMoarchImport,
} from './import-moarch';
import {
  addMediaFiles,
  deleteMediaFile,
  getMediaDataUrl,
  getMediaFileUrl,
  listMedia,
  openMediaFile,
  openMediaFolder,
} from './media';
import {
  getBasemapInfo,
  installBasemapInteractive,
  openMapsFolder,
  reloadBasemaps,
} from './basemap';
import { getMapStatus, initMbtiles } from './mbtiles';
import {
  completeWorkstationSetup,
  getWorkstationSetupDefaults,
  scanMapsDirectory,
} from './setup';
import { loadSettings, saveSettings } from './settings';
import { isWorkstationInitialized } from './workstation-config';
import {
  createTimelineEntry,
  deleteTimelineEntry,
  listTimeline,
  updateTimelineEntry,
} from './timeline';

export function registerIpcHandlers(): void {
  ipcMain.handle('archive:getPaths', () => getArchivePaths());
  ipcMain.handle('archive:getRoot', () => getArchiveRoot());
  ipcMain.handle('archive:chooseRoot', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose archive folder',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return setArchiveRoot(result.filePaths[0]);
  });
  ipcMain.handle('archive:openFolder', () => shell.openPath(getArchiveRoot()));

  ipcMain.handle('locations:list', (_e, filters: LocationFilters) => listLocations(filters));
  ipcMain.handle('locations:get', (_e, id: string) => getLocation(id));
  ipcMain.handle('locations:resolveReference', (_e, archiveId: string) => {
    const loc = getLocationByArchiveId(archiveId);
    if (!loc) return null;
    return {
      locationId: loc.id,
      archiveUUID: loc.archive_uuid,
      archiveId: loc.archive_id,
      name: loc.name,
    };
  });
  ipcMain.handle('locations:create', (_e, input: LocationInput) => createLocation(input));
  ipcMain.handle('locations:update', (_e, id: string, input: Partial<LocationInput>) =>
    updateLocation(id, input),
  );
  ipcMain.handle('locations:delete', (_e, id: string) => deleteLocation(id));
  ipcMain.handle('locations:distinct', (_e, field: 'archive_class' | 'county' | 'city' | 'type' | 'status' | 'risk_level') =>
    getDistinctValues(field),
  );
  ipcMain.handle('locations:tags', () => getAllTags());
  ipcMain.handle('locations:tagsToJson', (_e, tags: string[]) => tagsToJson(tags));

  ipcMain.handle('map:status', () => getMapStatus());
  ipcMain.handle('map:info', () => getBasemapInfo());
  ipcMain.handle('map:reload', () => reloadBasemaps());
  ipcMain.handle('map:installBasemap', (event) => installBasemapInteractive(event.sender));
  ipcMain.handle('map:openMapsFolder', () => openMapsFolder());

  ipcMain.handle('media:list', (_e, locationId: string, scope?: 'site' | 'research') =>
    listMedia(locationId, scope),
  );
  ipcMain.handle('media:add', (_e, locationId: string, paths: string[], scope?: 'site' | 'research') =>
    addMediaFiles(locationId, paths, scope, (progress) =>
      _e.sender.send('media:import-progress', progress),
    ),
  );
  ipcMain.handle(
    'media:delete',
    (_e, locationId: string, filename: string, scope?: 'site' | 'research') =>
      deleteMediaFile(locationId, filename, scope),
  );
  ipcMain.handle('media:openFolder', (_e, locationId: string, scope?: 'site' | 'research') =>
    openMediaFolder(locationId, scope),
  );
  ipcMain.handle('media:openFile', (_e, filePath: string) => openMediaFile(filePath));
  ipcMain.handle('media:fileUrl', (_e, filePath: string) => getMediaFileUrl(filePath));
  ipcMain.handle('media:dataUrl', (_e, filePath: string) => getMediaDataUrl(filePath));
  ipcMain.handle('media:pickFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Images, video, and documents',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm', 'pdf'],
        },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('export:run', (_e, format: ExportFormat, ids?: string[]) =>
    exportLocations(format, ids),
  );
  ipcMain.handle(
    'export:package',
    (_e, ids?: string[], heroMediaIds?: Record<string, string | undefined>) =>
      exportArchivePackage(ids, heroMediaIds, (progress) =>
        _e.sender.send('export:progress', progress),
      ),
  );
  ipcMain.handle('export:openFolder', () => shell.openPath(getArchivePaths().exports));

  ipcMain.handle('import:prepareMoarch', () => prepareMoarchImport());
  ipcMain.handle('import:executeMoarch', (_e, sessionId: string, options: MoarchImportOptions) =>
    executeMoarchImport(sessionId, options),
  );
  ipcMain.handle('import:cancelMoarch', (_e, sessionId: string) => cancelMoarchImport(sessionId));

  ipcMain.handle('backup:create', (_e, manual = true) => createBackup(manual));
  ipcMain.handle('backup:list', () => listBackups());
  ipcMain.handle('backup:restore', (_e, name: string) => restoreBackup(name));
  ipcMain.handle('backup:exportFull', async (_e, dest?: string) => {
    if (!dest) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Export full archive backup',
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return exportFullArchiveBackup(result.filePaths[0]);
    }
    return exportFullArchiveBackup(dest);
  });
  ipcMain.handle('backup:openFolder', () => shell.openPath(getArchivePaths().backups));

  ipcMain.handle('timeline:list', (_e, locationId: string) => listTimeline(locationId));
  ipcMain.handle('timeline:create', (_e, input: TimelineInput) => createTimelineEntry(input));
  ipcMain.handle('timeline:update', (_e, id: string, input: Partial<TimelineInput>) =>
    updateTimelineEntry(id, input),
  );
  ipcMain.handle('timeline:delete', (_e, id: string) => deleteTimelineEntry(id));

  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', (_e, settings: AppSettings) => saveSettings(settings));

  ipcMain.handle('app:init', () => {
    if (!isWorkstationInitialized()) {
      const defaults = getWorkstationSetupDefaults();
      return {
        needsSetup: true,
        paths: null,
        mapStatus: null,
        settings: loadSettings(),
        setupDefaults: defaults,
      };
    }
    ensureArchiveStructure();
    initDatabase();
    initMbtiles();
    return {
      needsSetup: false,
      paths: getArchivePaths(),
      mapStatus: getMapStatus(),
      settings: loadSettings(),
      setupDefaults: getWorkstationSetupDefaults(),
    };
  });

  ipcMain.handle('app:getSetupDefaults', () => getWorkstationSetupDefaults());

  ipcMain.handle('app:pickSetupDirectory', async (_e, title: string, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title,
      defaultPath,
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('app:scanMapsDirectory', (_e, mapsDir: string) => scanMapsDirectory(mapsDir));

  ipcMain.handle('app:completeSetup', (_e, input) => {
    const result = completeWorkstationSetup(input);
    startAutoBackupInterval();
    return result;
  });
}

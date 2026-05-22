import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { normalizeArchiveReferenceId } from '../shared/archive-references';
import type {
  ArchivePaths,
  BasemapInstallProgress,
  ExportFormat,
  ExportProgress,
  LocationInput,
  MoarchDuplicateAction,
  MoarchImportPreview,
} from '../shared/types';
import { ArchiveCard } from './components/ArchiveCard';
import { BasemapImportProgressPanel } from './components/BasemapImportProgress';
import { FieldEntryPanel } from './components/FieldEntryPanel';
import { LeftSidebar } from './components/LeftSidebar';
import { MapView, type MapViewHandle } from './components/MapView';
import { MoarchImportPanel } from './components/MoarchImportPanel';
import { PanelResizeHandle } from './components/PanelResizeHandle';
import { SettingsPanel } from './components/SettingsPanel';
import { WorkstationSetup } from './components/WorkstationSetup';
import { useArchive } from './hooks/useArchive';
import { useKeyboard } from './hooks/useKeyboard';
import { useMenuListeners } from './hooks/useMenuListeners';
import { useWorkstationLayout } from './hooks/useWorkstationLayout';
import './styles/app.css';

export default function App() {
  const {
    ready,
    needsSetup,
    setupDefaults,
    paths,
    mapStatus,
    settings,
    allLocations,
    filteredLocations,
    filteredIds,
    filters,
    selectedId,
    selectedLocation,
    error,
    setFilters,
    selectLocation,
    createLocation,
    updateLocation,
    deleteLocation,
    reloadMap,
    updateSettings,
    reloadLocations,
    init,
  } = useArchive();

  const { sidebarWidth, dossierWidth, resizeSidebar, resizeDossier, commitResize } =
    useWorkstationLayout(settings, updateSettings);

  const mapRef = useRef<MapViewHandle>(null);
  const [draft, setDraft] = useState<Partial<LocationInput> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showNaturePins, setShowNaturePins] = useState(true);
  const [showRumorFolkPins, setShowRumorFolkPins] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [importPreview, setImportPreview] = useState<MoarchImportPreview | null>(null);
  const [importingMoarch, setImportingMoarch] = useState(false);
  const [basemapImportProgress, setBasemapImportProgress] = useState<BasemapInstallProgress | null>(
    null,
  );
  const [basemapImportError, setBasemapImportError] = useState<string | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState<{ id: string; nonce: number } | null>(
    null,
  );
  const searchFocusRef = useRef<(() => void) | null>(null);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  }, []);

  const importBasemap = useCallback(async () => {
    setBasemapImportError(null);
    setBasemapImportProgress(null);
    try {
      const result = await window.moArchive.map.installBasemap();
      if (result.error === 'cancelled') return;
      if (!result.success) {
        setBasemapImportError(result.error ?? 'Basemap import failed.');
        return;
      }
      await reloadMap();
      if (result.warning) {
        showStatus(result.warning);
      } else {
        showStatus(`Basemap imported: ${result.mapStatus?.basemapFilename ?? 'ready'}`);
      }
    } catch {
      setBasemapImportError('Basemap import failed.');
    }
  }, [reloadMap, showStatus]);

  const dismissBasemapImport = useCallback(() => {
    setBasemapImportProgress(null);
    setBasemapImportError(null);
  }, []);

  const menuHandlers = useMemo(
    () => ({
      onExport: (format: ExportFormat) => {
        void window.moArchive.export.run(format).then((path) => {
          showStatus(`Exported to ${path}`);
        });
      },
      onExportPackage: () => {
        const ids = selectedId ? [selectedId] : undefined;
        const locations = ids
          ? allLocations.filter((loc) => ids.includes(loc.id))
          : allLocations;
        const heroMediaIds = Object.fromEntries(
          locations.map((loc) => [
            loc.id,
            localStorage.getItem(getHeroMediaStorageKey(loc.id)) ?? undefined,
          ]),
        );
        void window.moArchive.export
          .package(ids, heroMediaIds)
          .then((path) => {
            showStatus(`Curated archive package exported to ${path}`);
          })
          .catch((err) => {
            setExportProgress({
              total: 1,
              current: 1,
              stage: err instanceof Error ? err.message : 'Archive package export failed.',
              status: 'error',
            });
          });
      },
      onImportMoarch: () => {
        void window.moArchive.import.prepareMoarch().then((preview) => {
          if (preview) setImportPreview(preview);
        });
      },
      onImportMbtiles: () => {
        void importBasemap();
      },
      onBackup: () => {
        void window.moArchive.backup.create(true).then((info) => {
          showStatus(`Backup created: ${info.filename}`);
        });
      },
      onReloadMap: () => {
        void reloadMap();
      },
    }),
    [allLocations, importBasemap, reloadMap, selectedId, showStatus],
  );

  useMenuListeners(ready, menuHandlers);

  useEffect(() => {
    if (!ready) return undefined;
    return window.moArchive.export.onProgress((progress) => {
      setExportProgress(progress);
    });
  }, [ready]);

  useEffect(() => {
    if (!ready) return undefined;
    return window.moArchive.map.onInstallProgress((progress) => {
      setBasemapImportProgress(progress);
      if (progress.stage === 'error') {
        setBasemapImportError(progress.message ?? 'Basemap import failed.');
      }
      if (progress.stage === 'complete') {
        window.setTimeout(() => {
          setBasemapImportProgress((current) =>
            current?.stage === 'complete' ? null : current,
          );
        }, 1800);
      }
    });
  }, [ready]);

  const handleAddAtPoint = useCallback(
    (lng: number, lat: number) => {
      setDraft({
        name: '',
        location_text: '',
        latitude: lat,
        longitude: lng,
        type: 'industrial',
        status: 'unknown',
        risk_level: 'unknown',
        state: 'MO',
      });
      setIsNew(true);
      selectLocation(null);
    },
    [selectLocation],
  );

  const handleSave = useCallback(
    async (input: LocationInput) => {
      await createLocation(input);
      setDraft(null);
      setIsNew(false);
      showStatus('Dossier filed to index');
    },
    [createLocation, showStatus],
  );

  const handleSelect = useCallback(
    (id: string, focusMap = false) => {
      setIsNew(false);
      setDraft(null);
      selectLocation(id);
      if (focusMap) {
        setMapFocusRequest({ id, nonce: Date.now() });
      }
    },
    [selectLocation],
  );

  const handleOpenArchiveReference = useCallback(
    async (archiveId: string) => {
      const normalized = normalizeArchiveReferenceId(archiveId);
      const local = allLocations.find((l) => l.archive_id.toUpperCase() === normalized);
      if (local) {
        handleSelect(local.id, false);
        return;
      }
      const resolved = await window.moArchive.locations.resolveReference(normalized);
      if (resolved) {
        handleSelect(resolved.locationId, false);
        return;
      }
      showStatus(`No dossier on file for ${normalized}.`);
    },
    [allLocations, handleSelect, showStatus],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteLocation(id);
      showStatus('Dossier removed from index');
    },
    [deleteLocation, showStatus],
  );

  const handleCopyArchiveId = useCallback(
    async (archiveId: string) => {
      await navigator.clipboard.writeText(archiveId);
      showStatus(`Copied ${archiveId}`);
    },
    [showStatus],
  );

  const handleDeleteIntent = useCallback(
    (id: string) => {
      const loc = allLocations.find((l) => l.id === id);
      selectLocation(id);
      showStatus(
        `Selected ${loc?.archive_id ?? 'dossier'}. Press Ctrl+Q then Q to confirm removal.`,
      );
    },
    [allLocations, selectLocation, showStatus],
  );

  const startCreatePin = useCallback(() => {
    const map = mapRef.current?.getMap();
    const c = map?.getCenter();
    if (c) handleAddAtPoint(c.lng, c.lat);
  }, [handleAddAtPoint]);

  useKeyboard(
    {
      onPan: (dx, dy) => mapRef.current?.panBy(dx, dy),
      onZoomIn: () => mapRef.current?.zoomIn(),
      onZoomOut: () => mapRef.current?.zoomOut(),
      onCreatePin: startCreatePin,
      onConfirm: () => {
        if (isNew) {
          document.querySelector<HTMLButtonElement>('.field-entry .btn-primary')?.click();
        }
      },
      onCancel: () => {
        if (isNew) {
          setDraft(null);
          setIsNew(false);
        }
      },
      onSearch: () => searchFocusRef.current?.(),
      onDeleteRequest: () => {
        if (selectedId) void handleDelete(selectedId);
      },
    },
    ready,
  );

  if (error) {
    return (
      <div className="app-error">
        <h1>Workstation Error</h1>
        <p>{error}</p>
        <p>
          Run with <code>npm run dev</code> to launch the Electron shell.
        </p>
      </div>
    );
  }

  if (!ready && needsSetup && setupDefaults) {
    return (
      <WorkstationSetup
        defaults={setupDefaults}
        onComplete={() => {
          void init();
        }}
      />
    );
  }

  if (!ready) {
    return <div className="app-loading">Loading Missouri Underground…</div>;
  }

  return (
    <div
      className="workstation-shell"
      style={
        {
          '--sidebar-width': `${sidebarWidth}px`,
          '--archive-width': `${dossierWidth}px`,
        } as CSSProperties
      }
    >
      <div className="workstation-panel workstation-panel-left">
        <LeftSidebar
          locations={filteredLocations}
          allCount={allLocations.length}
          filters={filters}
          selectedId={selectedId}
          onSelect={(id) => handleSelect(id, false)}
          onGoTo={(id) => handleSelect(id, true)}
          onCopyArchiveId={(archiveId) => void handleCopyArchiveId(archiveId)}
          onDeleteIntent={handleDeleteIntent}
          onFiltersChange={setFilters}
          onOpenSettings={() => setSettingsOpen(true)}
          searchFocusRef={searchFocusRef}
          showHistorical={settings.showHistoricalPins}
          showNature={showNaturePins}
          showRumorsFolk={showRumorFolkPins}
          onToggleHistorical={(v) => void updateSettings({ showHistoricalPins: v })}
          onToggleNature={setShowNaturePins}
          onToggleRumorsFolk={setShowRumorFolkPins}
        />
      </div>

      <PanelResizeHandle side="left" onDrag={resizeSidebar} onCommit={commitResize} />

      <main className="map-main">
        <MapView
          ref={mapRef}
          mapStatus={mapStatus}
          allLocations={allLocations}
          filteredIds={filteredIds}
          selectedId={selectedId}
          focusRequest={mapFocusRequest}
          pinScale={settings.pinScale}
          showHistorical={settings.showHistoricalPins}
          showNature={showNaturePins}
          showRumorsFolk={showRumorFolkPins}
          onSelectLocation={(id) => handleSelect(id, true)}
          onAddAtPoint={handleAddAtPoint}
        />
        <Toolbar
          paths={paths}
          onExport={(fmt) =>
            void window.moArchive.export.run(fmt).then((p) => showStatus(`Exported: ${p}`))
          }
          onBackup={() =>
            void window.moArchive.backup.create(true).then((b) => showStatus(`Backup: ${b.filename}`))
          }
          onOpenArchive={() => void window.moArchive.archive.openFolder()}
          onReloadMap={() => void reloadMap()}
          onSettings={() => setSettingsOpen(true)}
        />
        {statusMessage && <div className="status-toast">{statusMessage}</div>}
        {(basemapImportProgress || basemapImportError) && (
          <BasemapImportProgressPanel
            progress={basemapImportProgress}
            error={basemapImportError}
            onDismiss={dismissBasemapImport}
          />
        )}
      </main>

      <PanelResizeHandle side="right" onDrag={resizeDossier} onCommit={commitResize} />

      <div className="workstation-panel workstation-panel-right">
      {isNew && draft ? (
        <FieldEntryPanel
          draft={draft}
          onSave={handleSave}
          onCancel={() => {
            setDraft(null);
            setIsNew(false);
          }}
        />
      ) : selectedLocation ? (
        <ArchiveCard
          key={selectedLocation.id}
          location={selectedLocation}
          trustedMachineIds={[
            settings.currentMachineId,
            ...settings.trustedSignatures.map((entry) => entry.machineId).filter(Boolean),
          ]}
          trustedSignatures={settings.trustedSignatures.map((entry) => entry.signature).filter(Boolean)}
          onUpdate={updateLocation}
          onDelete={(id) => void handleDelete(id)}
          onOpenReference={(archiveId) => void handleOpenArchiveReference(archiveId)}
        />
      ) : (
        <aside className="sidebar sidebar-right empty-panel">
          <p>Select a dossier from the index or survey a site on the map.</p>
          <p className="text-muted">C · field survey · WASD · pan · Z/X · zoom</p>
        </aside>
      )}
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onMapReload={reloadMap}
      />
      {importPreview && (
        <MoarchImportPanel
          preview={importPreview}
          importing={importingMoarch}
          onCancel={() => {
            void window.moArchive.import.cancelMoarch(importPreview.sessionId);
            setImportPreview(null);
          }}
          onImport={(duplicateAction: MoarchDuplicateAction) => {
            if (duplicateAction === 'cancel') {
              void window.moArchive.import.cancelMoarch(importPreview.sessionId);
              setImportPreview(null);
              return;
            }
            setImportingMoarch(true);
            void window.moArchive.import
              .executeMoarch(importPreview.sessionId, { duplicateAction })
              .then(async (result) => {
                if (result.cancelled) return;
                await reloadLocations();
                const count = result.imported.length;
                if (count > 0) {
                  selectLocation(result.imported[0].locationId);
                  const successMessage = `Received ${count} dossier${count === 1 ? '' : 's'} into index${result.skipped ? ` (${result.skipped} skipped)` : ''}`;
                  showStatus(
                    result.cleanupWarning
                      ? `${successMessage} ${result.cleanupWarning}`
                      : successMessage,
                  );
                } else {
                  showStatus(
                    result.cleanupWarning ??
                      (result.skipped
                        ? 'Import skipped — duplicate dossier on file.'
                        : 'No dossiers received.'),
                  );
                }
              })
              .catch((err) => {
                showStatus(err instanceof Error ? err.message : 'Archive import failed.');
              })
              .finally(() => {
                setImportingMoarch(false);
                setImportPreview(null);
              });
          }}
        />
      )}
      {exportProgress && (
        <ExportProgressPanel
          progress={exportProgress}
          onOpenFolder={() => void window.moArchive.export.openFolder()}
          onDismiss={() => setExportProgress(null)}
        />
      )}
    </div>
  );
}

function getHeroMediaStorageKey(locationId: string): string {
  return `mo-underground:hero-media:${locationId}`;
}

function ExportProgressPanel({
  progress,
  onOpenFolder,
  onDismiss,
}: {
  progress: ExportProgress;
  onOpenFolder: () => void;
  onDismiss: () => void;
}) {
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const done = progress.status === 'complete';
  const failed = progress.status === 'error';

  return (
    <aside className={`export-progress-panel ${done ? 'complete' : ''} ${failed ? 'error' : ''}`} aria-live="polite">
      <div className="export-progress-header">
        <span>
          {done
            ? 'Archive Package Exported'
            : failed
              ? 'Archive Package Export Failed'
              : 'Exporting Archive Package...'}
        </span>
        <strong>
          {progress.current} / {progress.total}
        </strong>
      </div>
      <div className="export-progress-track" aria-hidden="true">
        <div className="export-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="export-progress-stage">
        <span>{progress.stage}</span>
      </div>
      {(done || failed) && (
        <div className="export-progress-actions">
          {done && (
            <button type="button" className="btn-ghost btn-sm" onClick={onOpenFolder}>
              Open Folder
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </aside>
  );
}

function Toolbar({
  paths,
  onExport,
  onBackup,
  onOpenArchive,
  onReloadMap,
  onSettings,
}: {
  paths: ArchivePaths | null;
  onExport: (format: ExportFormat) => void;
  onBackup: () => void;
  onOpenArchive: () => void;
  onReloadMap: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="map-toolbar">
      <span className="archive-path" title={paths?.root}>
        {paths?.root ?? ''}
      </span>
      <div className="toolbar-actions">
        <button type="button" onClick={onSettings} title="Settings">
          Settings
        </button>
        <button type="button" onClick={onReloadMap} title="Reload basemap">
          Map
        </button>
        <button type="button" onClick={() => onExport('gpx')}>
          GPX
        </button>
        <button type="button" onClick={() => onExport('kml')}>
          KML
        </button>
        <button type="button" onClick={() => onExport('geojson')}>
          GeoJSON
        </button>
        <button type="button" onClick={onBackup}>
          Backup
        </button>
        <button type="button" onClick={onOpenArchive}>
          Folder
        </button>
      </div>
    </div>
  );
}

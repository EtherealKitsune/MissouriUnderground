import { useEffect, useRef } from 'react';

import type { ExportFormat } from '../../shared/types';

export interface MenuListenerHandlers {
  onExport: (format: ExportFormat) => void;
  onExportPackage: () => void;
  onImportMoarch: () => void;
  onImportMbtiles: () => void;
  onBackup: () => void;
  onReloadMap: () => void;
}

/**
 * Subscribe to main-process menu IPC events.
 * Uses a ref for handlers so the effect dependency array stays a fixed [enabled].
 */
export function useMenuListeners(enabled: boolean, handlers: MenuListenerHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || typeof window.moArchive?.onMenu !== 'function') {
      return;
    }

    const api = window.moArchive;

    const unsubExport = api.onMenu('menu:export', (format) => {
      handlersRef.current.onExport(format as ExportFormat);
    });
    const unsubBackup = api.onMenu('menu:backup', () => {
      handlersRef.current.onBackup();
    });
    const unsubExportPackage = api.onMenu('menu:export-package', () => {
      handlersRef.current.onExportPackage();
    });
    const unsubImportMoarch = api.onMenu('menu:import-moarch', () => {
      handlersRef.current.onImportMoarch();
    });
    const unsubImportMbtiles = api.onMenu('menu:import-mbtiles', () => {
      handlersRef.current.onImportMbtiles();
    });
    const unsubReload = api.onMenu('menu:reload-map', () => {
      handlersRef.current.onReloadMap();
    });

    return () => {
      unsubExport();
      unsubBackup();
      unsubExportPackage();
      unsubImportMoarch();
      unsubImportMbtiles();
      unsubReload();
    };
  }, [enabled]);
}

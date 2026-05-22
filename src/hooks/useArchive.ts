import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppSettings, ArchivePaths, Location, LocationFilters, MapStatus } from '../../shared/types';
import type { WorkstationSetupDefaults } from '../../shared/setup-types';
import { DEFAULT_SETTINGS } from '../../shared/types';

export function useArchive() {
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupDefaults, setSetupDefaults] = useState<WorkstationSetupDefaults | null>(null);
  const [paths, setPaths] = useState<ArchivePaths | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [filters, setFilters] = useState<LocationFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    const list = await window.moArchive.locations.list({});
    setAllLocations(list);
    return list;
  }, []);

  const refreshFiltered = useCallback(
    async (f?: LocationFilters) => {
      const activeFilters = f ?? filters;
      return window.moArchive.locations.list(activeFilters);
    },
    [filters],
  );

  const [filteredLocations, setFilteredLocations] = useState<Location[]>([]);

  const filteredIds = useMemo(
    () => new Set(filteredLocations.map((l) => l.id)),
    [filteredLocations],
  );

  const applyInitResult = useCallback(
    async (result: Awaited<ReturnType<typeof window.moArchive.init>>) => {
      if (result.needsSetup) {
        setNeedsSetup(true);
        setSetupDefaults(result.setupDefaults);
        setSettings(result.settings ?? DEFAULT_SETTINGS);
        setReady(false);
        return;
      }
      setNeedsSetup(false);
      setSetupDefaults(result.setupDefaults);
      setPaths(result.paths);
      setMapStatus(result.mapStatus);
      setSettings(result.settings ?? DEFAULT_SETTINGS);
      const list = await window.moArchive.locations.list({});
      setAllLocations(list);
      setFilteredLocations(list);
      setReady(true);
    },
    [],
  );

  const init = useCallback(async () => {
    if (typeof window === 'undefined' || !('moArchive' in window)) {
      setError('Missouri Underground must run inside Electron (use npm run dev).');
      return;
    }
    try {
      const result = await window.moArchive.init();
      await applyInitResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to initialize archive');
    }
  }, [applyInitResult]);

  useEffect(() => {
    init();
  }, [init]);

  const applyFilters = useCallback(
    async (newFilters: LocationFilters) => {
      setFilters(newFilters);
      const list = await window.moArchive.locations.list(newFilters);
      setFilteredLocations(list);
    },
    [],
  );

  const selectLocation = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const selectedLocation = allLocations.find((l) => l.id === selectedId) ?? null;

  const createLocation = useCallback(
    async (input: Parameters<typeof window.moArchive.locations.create>[0]) => {
      const loc = await window.moArchive.locations.create(input);
      await refreshAll();
      const list = await refreshFiltered();
      setFilteredLocations(list);
      setSelectedId(loc.id);
      return loc;
    },
    [refreshAll, refreshFiltered],
  );

  const updateLocation = useCallback(
    async (id: string, input: Parameters<typeof window.moArchive.locations.update>[1]) => {
      const loc = await window.moArchive.locations.update(id, input);
      await refreshAll();
      const list = await refreshFiltered();
      setFilteredLocations(list);
      return loc;
    },
    [refreshAll, refreshFiltered],
  );

  const deleteLocation = useCallback(
    async (id: string) => {
      await window.moArchive.locations.delete(id);
      if (selectedId === id) setSelectedId(null);
      await refreshAll();
      const list = await refreshFiltered();
      setFilteredLocations(list);
    },
    [refreshAll, refreshFiltered, selectedId],
  );

  const reloadMap = useCallback(async () => {
    const status = await window.moArchive.map.reload();
    setMapStatus(status);
    return status;
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    const saved = await window.moArchive.settings.save(next);
    setSettings(saved);
    return saved;
  }, [settings]);

  const reloadLocations = useCallback(async () => {
    await refreshAll();
    const list = await refreshFiltered();
    setFilteredLocations(list);
    return list;
  }, [refreshAll, refreshFiltered]);

  return {
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
    setFilters: applyFilters,
    selectLocation,
    createLocation,
    updateLocation,
    deleteLocation,
    reloadMap,
    updateSettings,
    init,
    refreshAll,
    reloadLocations,
  };
}

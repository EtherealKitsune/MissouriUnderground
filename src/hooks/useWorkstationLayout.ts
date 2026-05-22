import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DOSSIER_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_DEFAULT,
  clampDossierWidth,
  clampSidebarWidth,
  fitWorkstationLayout,
} from '../../shared/workstation-layout';
import type { AppSettings } from '../../shared/types';

export function useWorkstationLayout(
  settings: AppSettings,
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>,
) {
  const [sidebarWidth, setSidebarWidth] = useState(
    settings.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT,
  );
  const [dossierWidth, setDossierWidth] = useState(settings.dossierWidth ?? DOSSIER_WIDTH_DEFAULT);
  const sidebarRef = useRef(sidebarWidth);
  const dossierRef = useRef(dossierWidth);
  const draggingRef = useRef(false);

  sidebarRef.current = sidebarWidth;
  dossierRef.current = dossierWidth;

  useEffect(() => {
    setSidebarWidth(settings.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT);
    setDossierWidth(settings.dossierWidth ?? DOSSIER_WIDTH_DEFAULT);
  }, [settings.sidebarWidth, settings.dossierWidth]);

  const applyFit = useCallback((persist = false) => {
    const fitted = fitWorkstationLayout(
      window.innerWidth,
      sidebarRef.current,
      dossierRef.current,
    );
    setSidebarWidth(fitted.sidebarWidth);
    setDossierWidth(fitted.dossierWidth);
    sidebarRef.current = fitted.sidebarWidth;
    dossierRef.current = fitted.dossierWidth;
    if (persist && !draggingRef.current) {
      void updateSettings({
        sidebarWidth: fitted.sidebarWidth,
        dossierWidth: fitted.dossierWidth,
      });
    }
  }, [updateSettings]);

  useEffect(() => {
    const onResize = () => applyFit(false);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyFit]);

  const persistWidths = useCallback(
    (nextSidebar: number, nextDossier: number) => {
      const fitted = fitWorkstationLayout(window.innerWidth, nextSidebar, nextDossier);
      setSidebarWidth(fitted.sidebarWidth);
      setDossierWidth(fitted.dossierWidth);
      sidebarRef.current = fitted.sidebarWidth;
      dossierRef.current = fitted.dossierWidth;
      void updateSettings({
        sidebarWidth: fitted.sidebarWidth,
        dossierWidth: fitted.dossierWidth,
      });
    },
    [updateSettings],
  );

  const resizeSidebar = useCallback((deltaX: number) => {
    draggingRef.current = true;
    const next = clampSidebarWidth(sidebarRef.current + deltaX);
    const fitted = fitWorkstationLayout(window.innerWidth, next, dossierRef.current);
    setSidebarWidth(fitted.sidebarWidth);
    setDossierWidth(fitted.dossierWidth);
    sidebarRef.current = fitted.sidebarWidth;
    dossierRef.current = fitted.dossierWidth;
  }, []);

  const resizeDossier = useCallback((deltaX: number) => {
    draggingRef.current = true;
    const next = clampDossierWidth(dossierRef.current - deltaX);
    const fitted = fitWorkstationLayout(window.innerWidth, sidebarRef.current, next);
    setSidebarWidth(fitted.sidebarWidth);
    setDossierWidth(fitted.dossierWidth);
    sidebarRef.current = fitted.sidebarWidth;
    dossierRef.current = fitted.dossierWidth;
  }, []);

  const commitResize = useCallback(() => {
    draggingRef.current = false;
    void updateSettings({
      sidebarWidth: sidebarRef.current,
      dossierWidth: dossierRef.current,
      layoutPreset: undefined,
    });
  }, [updateSettings]);

  return {
    sidebarWidth,
    dossierWidth,
    resizeSidebar,
    resizeDossier,
    commitResize,
    persistWidths,
  };
}

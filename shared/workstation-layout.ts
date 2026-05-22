/** Workstation-local panel ergonomics — not exported via `.moarch`. */

export const SIDEBAR_WIDTH_MIN = 240;
export const SIDEBAR_WIDTH_MAX = 460;
export const SIDEBAR_WIDTH_DEFAULT = 300;

export const DOSSIER_WIDTH_MIN = 360;
export const DOSSIER_WIDTH_MAX = 760;
export const DOSSIER_WIDTH_DEFAULT = 380;

export const MAP_WIDTH_MIN = 200;
export const RESIZE_HANDLE_WIDTH = 4;

export type WorkstationLayoutPreset = 'compact' | 'standard' | 'research';

export const LAYOUT_PRESETS: Record<
  WorkstationLayoutPreset,
  { sidebarWidth: number; dossierWidth: number; label: string }
> = {
  compact: { sidebarWidth: 260, dossierWidth: 380, label: 'Compact' },
  standard: { sidebarWidth: 300, dossierWidth: 420, label: 'Standard' },
  research: { sidebarWidth: 340, dossierWidth: 520, label: 'Research' },
};

export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width)));
}

export function clampDossierWidth(width: number): number {
  return Math.round(Math.min(DOSSIER_WIDTH_MAX, Math.max(DOSSIER_WIDTH_MIN, width)));
}

export function fitWorkstationLayout(
  viewportWidth: number,
  sidebarWidth: number,
  dossierWidth: number,
): { sidebarWidth: number; dossierWidth: number } {
  let sidebar = clampSidebarWidth(sidebarWidth);
  let dossier = clampDossierWidth(dossierWidth);
  const chrome = RESIZE_HANDLE_WIDTH * 2;
  const available = viewportWidth - chrome;

  let mapWidth = available - sidebar - dossier;
  if (mapWidth >= MAP_WIDTH_MIN) {
    return { sidebarWidth: sidebar, dossierWidth: dossier };
  }

  let deficit = MAP_WIDTH_MIN - mapWidth;
  const sidebarGive = Math.min(deficit, sidebar - SIDEBAR_WIDTH_MIN);
  sidebar -= sidebarGive;
  deficit -= sidebarGive;
  mapWidth = available - sidebar - dossier;

  if (mapWidth >= MAP_WIDTH_MIN) {
    return { sidebarWidth: sidebar, dossierWidth: dossier };
  }

  const dossierGive = Math.min(deficit, dossier - DOSSIER_WIDTH_MIN);
  dossier -= dossierGive;

  return { sidebarWidth: sidebar, dossierWidth: dossier };
}

export function normalizeWorkstationLayout(settings: {
  sidebarWidth?: number;
  dossierWidth?: number;
}): { sidebarWidth: number; dossierWidth: number } {
  return {
    sidebarWidth: clampSidebarWidth(settings.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT),
    dossierWidth: clampDossierWidth(settings.dossierWidth ?? DOSSIER_WIDTH_DEFAULT),
  };
}

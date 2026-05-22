import type { Location } from '../../shared/types';

const W = { L: 5, M: 10, H: 20, VH: 35 } as const;

export function computeArchiveScore(
  loc: Location,
  timelineCount: number,
  mediaCount: number,
  substructureCount = 0,
): number {
  let score = 0;
  if (timelineCount > 0) score += W.VH;
  if (loc.research_notes?.trim()) score += W.VH;
  if (loc.access_notes?.trim()) score += W.VH;
  if (loc.structural_notes?.trim()) score += W.H;
  if (loc.risk_level && loc.risk_level !== 'unknown') score += W.H;
  if (loc.source_links?.trim()) score += W.H;
  if (mediaCount > 0) score += W.M;
  try {
    const tags = JSON.parse(loc.tags || '[]') as unknown[];
    if (Array.isArray(tags) && tags.length > 0) score += W.M;
  } catch {
    /* ignore */
  }
  if (loc.building_count > 0) score += W.M;
  if (substructureCount > 0) score += W.M;
  if (loc.coordinates_audited) score += W.L;
  if (loc.notes?.trim()) score += W.L;
  return score;
}

export function archiveLevelLabel(score: number): string {
  if (score >= 75) return 'Complete Archive';
  if (score >= 36) return 'Partial Archive';
  return 'Basic Archive';
}

export function archiveLevelClass(score: number): 'basic' | 'partial' | 'complete' {
  if (score >= 75) return 'complete';
  if (score >= 36) return 'partial';
  return 'basic';
}

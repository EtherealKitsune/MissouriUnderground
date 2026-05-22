/** Top-level archive classes. These guide metadata emphasis, not workflow forks. */
export const ARCHIVE_CLASSES = [
  'structure_site',
  'natural_structure',
  'rumored_natural_structure',
  'folk_tale_location',
] as const;

export type ArchiveClass = (typeof ARCHIVE_CLASSES)[number];

export const ARCHIVE_CLASS_LABELS: Record<ArchiveClass, string> = {
  structure_site: 'Structure Site',
  natural_structure: 'Natural Structure',
  rumored_natural_structure: 'Rumored Natural Structure',
  folk_tale_location: 'Folk Tale Location',
};

const ARCHIVE_CLASS_CODES: Record<Exclude<ArchiveClass, 'structure_site'>, string> = {
  natural_structure: 'NAT',
  rumored_natural_structure: 'RUM',
  folk_tale_location: 'FOL',
};

export const ARCHIVE_ID_INDEX_WIDTH = 5;

export function normalizeArchiveClass(value: string | undefined | null): ArchiveClass {
  const map: Record<string, ArchiveClass> = {
    structure_site: 'structure_site',
    structure: 'structure_site',
    site: 'structure_site',
    natural_structure: 'natural_structure',
    natural: 'natural_structure',
    rumored_natural_structure: 'rumored_natural_structure',
    rumored_natural: 'rumored_natural_structure',
    rumor: 'rumored_natural_structure',
    folk_tale_location: 'folk_tale_location',
    folk_tale: 'folk_tale_location',
    folklore: 'folk_tale_location',
  };
  return map[value ?? ''] ?? 'structure_site';
}

/** Site type taxonomy aligned with map pin system. */
export const SITE_TYPES = [
  'industrial',
  'military',
  'medical',
  'government',
  'religious',
  'educational',
  'transportation',
  'agricultural',
  'residential',
  'commercial',
] as const;

export type SiteType = (typeof SITE_TYPES)[number];

export const SITE_TYPE_CODES: Record<SiteType, string> = {
  industrial: 'IND',
  military: 'MIL',
  medical: 'MED',
  government: 'GOV',
  religious: 'REL',
  educational: 'EDU',
  transportation: 'TRN',
  agricultural: 'AGR',
  residential: 'RES',
  commercial: 'COM',
};

export function getArchiveIdFamilyCode(
  archiveClass: string | undefined | null,
  siteType: string,
): string {
  const normalizedClass = normalizeArchiveClass(archiveClass);
  if (normalizedClass !== 'structure_site') {
    return ARCHIVE_CLASS_CODES[normalizedClass];
  }

  return SITE_TYPE_CODES[normalizeSiteType(siteType)];
}

export function getArchiveIdPrefix(
  state: string,
  archiveClass: string | undefined | null,
  siteType: string,
): string {
  const stateCode = (state || 'MO').toUpperCase();
  return `${stateCode}-${getArchiveIdFamilyCode(archiveClass, siteType)}`;
}

export function updateArchiveIdPrefix(
  archiveId: string,
  state: string,
  archiveClass: string | undefined | null,
  siteType: string,
): string {
  const prefix = getArchiveIdPrefix(state, archiveClass, siteType);
  const match = archiveId.match(/^[A-Z]{2}-[A-Z0-9]+-(\d+)$/i);
  const index = match?.[1] ?? '00001';
  return `${prefix}-${index}`;
}

/** Map legacy DB values to current site types. */
export function normalizeSiteType(type: string): SiteType {
  const map: Record<string, SiteType> = {
    industrial: 'industrial',
    military: 'military',
    medical: 'medical',
    government: 'government',
    religious: 'religious',
    educational: 'educational',
    transportation: 'transportation',
    agricultural: 'agricultural',
    residential: 'residential',
    commercial: 'commercial',
    building: 'industrial',
    ruins: 'industrial',
    bridge: 'transportation',
    tunnel: 'transportation',
    cemetery: 'religious',
    other: 'industrial',
  };
  return map[type] ?? 'industrial';
}

export const PRIORITY_OVERRIDES = [
  '',
  'structurally_unsafe',
  'collapse',
  'hazardous',
] as const;

export type PriorityOverride = (typeof PRIORITY_OVERRIDES)[number];

export const TIMELINE_CATEGORIES = [
  'Historical',
  'Structural',
  'Research',
  'Ownership',
  'Exploration',
  'Demolition',
] as const;

export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export const ARCHIVE_LEVEL_LABELS = {
  basic: 'Basic Archive',
  partial: 'Partial Archive',
  complete: 'Complete Archive',
} as const;

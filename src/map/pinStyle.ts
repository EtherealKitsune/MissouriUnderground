import { normalizeSiteType, type SiteType } from '../../shared/archive-meta';

/** Pin fill colors by site type (archival industrial palette). */
export const PIN_TYPE_COLORS: Record<SiteType, string> = {
  industrial: '#4a7ab8',
  military: '#4a8f5c',
  medical: '#b85c6a',
  government: '#8b6bb8',
  religious: '#4a9e9e',
  educational: '#9a8b4a',
  transportation: '#7a8490',
  agricultural: '#6a8f4a',
  residential: '#c4a84a',
  commercial: '#c47a3a',
};

export const PRIORITY_OVERRIDE_COLOR = '#c44a3a';
export const ARCHIVE_CLASS_COLORS: Record<string, string> = {
  natural_structure: '#7d745f',
  rumored_natural_structure: '#666b62',
  folk_tale_location: '#6b6476',
};
export const RING_COLORS: Record<string, string> = {
  low: '#4a8f5c',
  medium: '#9a8b4a',
  high: '#c47a3a',
  extreme: '#c44a3a',
  unknown: '#5a6270',
};

export function pinFillColor(type: string, priorityOverride: string, status: string): string {
  if (priorityOverride) return PRIORITY_OVERRIDE_COLOR;
  if (status === 'demolished') return '#4a5058';
  return PIN_TYPE_COLORS[normalizeSiteType(type)];
}

export function pinRingColor(riskLevel: string): string {
  return RING_COLORS[riskLevel] ?? RING_COLORS.unknown;
}

export function isHistorical(status: string): boolean {
  return status === 'demolished';
}

/** MapLibre expression: circle-color from feature properties. */
export const PIN_COLOR_EXPRESSION = [
  'case',
  ['!=', ['get', 'priorityOverride'], ''],
  PRIORITY_OVERRIDE_COLOR,
  ['==', ['get', 'status'], 'demolished'],
  '#4a5058',
  ['==', ['get', 'archiveClass'], 'natural_structure'],
  ARCHIVE_CLASS_COLORS.natural_structure,
  ['==', ['get', 'archiveClass'], 'rumored_natural_structure'],
  ARCHIVE_CLASS_COLORS.rumored_natural_structure,
  ['==', ['get', 'archiveClass'], 'folk_tale_location'],
  ARCHIVE_CLASS_COLORS.folk_tale_location,
  [
    'match',
    ['get', 'siteType'],
    'industrial',
    PIN_TYPE_COLORS.industrial,
    'military',
    PIN_TYPE_COLORS.military,
    'medical',
    PIN_TYPE_COLORS.medical,
    'government',
    PIN_TYPE_COLORS.government,
    'religious',
    PIN_TYPE_COLORS.religious,
    'educational',
    PIN_TYPE_COLORS.educational,
    'transportation',
    PIN_TYPE_COLORS.transportation,
    'agricultural',
    PIN_TYPE_COLORS.agricultural,
    'residential',
    PIN_TYPE_COLORS.residential,
    'commercial',
    PIN_TYPE_COLORS.commercial,
    PIN_TYPE_COLORS.industrial,
  ],
];

export const PIN_RING_EXPRESSION = [
  'match',
  ['get', 'riskLevel'],
  'low',
  RING_COLORS.low,
  'medium',
  RING_COLORS.medium,
  'high',
  RING_COLORS.high,
  'extreme',
  RING_COLORS.extreme,
  RING_COLORS.unknown,
];

export const PIN_RADIUS_EXPRESSION = [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  ['+', ['case', ['get', 'selected'], 11, 8], 1],
  ['case', ['get', 'selected'], 10, 7],
];

export const PIN_OPACITY_EXPRESSION = [
  'case',
  ['get', 'filtered'],
  1,
  ['get', 'historical'],
  0.35,
  0.22,
];

export const PIN_FILL_OPACITY_EXPRESSION = [
  'case',
  ['get', 'selected'],
  1,
  ['==', ['get', 'archiveClass'], 'folk_tale_location'],
  0.18,
  ['==', ['get', 'archiveClass'], 'rumored_natural_structure'],
  0.45,
  ['get', 'historical'],
  0.25,
  ['get', 'filtered'],
  0.88,
  0.35,
];

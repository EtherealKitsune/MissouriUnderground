import type { StyleSpecification } from 'maplibre-gl';

import type { MapStatus } from '../../shared/types';

const MISSOURI_CENTER: [number, number] = [-92.65, 38.15];

// Regional workspace bounds: Missouri remains centered, while nearby rail corridors
// and border-state context stay available without enabling world scrolling.
const MISSOURI_BOUNDS: [[number, number], [number, number]] = [
  [-97.65, 34.75],
  [-87.65, 41.35],
];
const MISSOURI_INITIAL_ZOOM = 5.75;
const MISSOURI_MIN_ZOOM = 5.15;

/** Archival industrial palette — muted, low-glare, structure-forward. */
const C = {
  bg: '#0d1117',
  forest: '#162218',
  grass: '#121814',
  farmland: '#181a14',
  water: '#1a3348',
  waterway: '#243d58',
  industrial: '#3a322c',
  railYard: '#322c28',
  warehouse: '#35302a',
  residential: '#141820',
  building: '#3a4048',
  buildingOutline: '#565e6a',
  roadMinor: '#2a3038',
  roadMajor: '#3d454f',
  roadMotorway: '#4f5864',
  railCore: '#a85f3c',
  railCasing: '#4a3024',
  county: '#2a3544',
  state: '#3d5068',
  label: '#8a96a8',
  labelMajor: '#a2adba',
  labelRoad: '#788694',
  labelRiver: '#5a7a94',
  labelWater: '#627f96',
  labelRail: '#9a725d',
  labelHalo: '#0d1117',
} as const;

const SRC = 'missouri';

export function buildMapStyle(mapStatus: MapStatus): {
  style: StyleSpecification;
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxBounds: [[number, number], [number, number]];
} {
  const center = MISSOURI_CENTER;
  const zoom = MISSOURI_INITIAL_ZOOM;
  const minZoom = MISSOURI_MIN_ZOOM;
  const maxBounds = MISSOURI_BOUNDS;

  if (!mapStatus.hasTiles) {
    return {
      center,
      zoom,
      minZoom,
      maxBounds,
      style: {
        version: 8,
        name: 'Missouri Archive (no tiles)',
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': C.bg },
          },
        ],
      },
    };
  }

  const ext = mapStatus.tileFormat === 'raster' ? 'png' : 'pbf';
  const tileUrl = `moarchive://tile/{z}/{x}/{y}.${ext}`;
  const minzoom = mapStatus.minZoom ?? 0;
  const maxzoom = mapStatus.maxZoom ?? 14;

  if (mapStatus.tileFormat === 'raster') {
    return {
      center,
      zoom,
      minZoom,
      maxBounds,
      style: {
        version: 8,
        name: 'Missouri Archive',
        sources: {
          [SRC]: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            minzoom,
            maxzoom,
          },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': C.bg } },
          { id: 'missouri-raster', type: 'raster', source: SRC, paint: { 'raster-opacity': 0.95 } },
        ],
      },
    };
  }

  const labelFont = ['Open Sans Regular'];

  return {
    center,
    zoom,
    minZoom,
    maxBounds,
    style: {
      version: 8,
      name: 'Missouri Archive — Industrial Survey',
      glyphs: 'glyphs/{fontstack}/{range}.pbf',
      sources: {
        [SRC]: {
          type: 'vector',
          tiles: [tileUrl],
          minzoom,
          maxzoom,
        },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': C.bg } },

        // --- Terrain & land cover (subtle base) ---
        {
          id: 'landcover-grass',
          type: 'fill',
          source: SRC,
          'source-layer': 'landcover',
          filter: ['in', 'class', 'grass', 'scrub', 'farmland'],
          paint: {
            'fill-color': [
              'match',
              ['get', 'class'],
              'farmland',
              C.farmland,
              'scrub',
              C.grass,
              C.grass,
            ],
            'fill-opacity': 0.35,
          },
        },
        {
          id: 'landcover-wood',
          type: 'fill',
          source: SRC,
          'source-layer': 'landcover',
          filter: ['in', 'class', 'wood', 'forest'],
          paint: { 'fill-color': C.forest, 'fill-opacity': 0.55 },
        },

        // --- Land use (industrial exploration emphasis) ---
        {
          id: 'landuse-residential',
          type: 'fill',
          source: SRC,
          'source-layer': 'landuse',
          filter: ['==', 'class', 'residential'],
          paint: { 'fill-color': C.residential, 'fill-opacity': 0.25 },
        },
        {
          id: 'landuse-industrial',
          type: 'fill',
          source: SRC,
          'source-layer': 'landuse',
          filter: ['in', 'class', 'industrial', 'quarry', 'construction'],
          paint: { 'fill-color': C.industrial, 'fill-opacity': 0.65 },
        },
        {
          id: 'landuse-rail-yard',
          type: 'fill',
          source: SRC,
          'source-layer': 'landuse',
          filter: ['==', 'class', 'railway'],
          paint: { 'fill-color': C.railYard, 'fill-opacity': 0.7 },
        },
        {
          id: 'landuse-warehouse',
          type: 'fill',
          source: SRC,
          'source-layer': 'landuse',
          filter: ['in', 'class', 'commercial', 'retail'],
          minzoom: 10,
          paint: { 'fill-color': C.warehouse, 'fill-opacity': 0.4 },
        },

        // --- Hydrology ---
        {
          id: 'water',
          type: 'fill',
          source: SRC,
          'source-layer': 'water',
          paint: { 'fill-color': C.water, 'fill-opacity': 0.9 },
        },
        {
          id: 'waterway-stream',
          type: 'line',
          source: SRC,
          'source-layer': 'waterway',
          filter: ['in', 'class', 'stream', 'ditch', 'drain'],
          paint: { 'line-color': C.waterway, 'line-width': 0.6, 'line-opacity': 0.5 },
        },
        {
          id: 'waterway-river',
          type: 'line',
          source: SRC,
          'source-layer': 'waterway',
          filter: ['in', 'class', 'river', 'canal'],
          paint: {
            'line-color': C.waterway,
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 2.5, 14, 4],
          },
        },

        // --- Administrative boundaries ---
        {
          id: 'boundary-county',
          type: 'line',
          source: SRC,
          'source-layer': 'boundary',
          filter: ['==', 'admin_level', 6],
          minzoom: 7,
          paint: {
            'line-color': C.county,
            'line-width': 0.6,
            'line-opacity': 0.45,
            'line-dasharray': [3, 2],
          },
        },
        {
          id: 'boundary-state',
          type: 'line',
          source: SRC,
          'source-layer': 'boundary',
          filter: ['==', 'admin_level', 4],
          paint: {
            'line-color': C.state,
            'line-width': 1.25,
            'line-opacity': 0.7,
          },
        },

        // --- Roads (de-emphasized vs structures) ---
        {
          id: 'road-service',
          type: 'line',
          source: SRC,
          'source-layer': 'transportation',
          minzoom: 13,
          filter: ['in', 'class', 'service', 'track', 'path'],
          paint: {
            'line-color': C.roadMinor,
            'line-width': 0.4,
            'line-opacity': 0.45,
          },
        },
        {
          id: 'road-minor',
          type: 'line',
          source: SRC,
          'source-layer': 'transportation',
          minzoom: 11,
          filter: ['in', 'class', 'minor', 'tertiary'],
          paint: {
            'line-color': C.roadMinor,
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 1],
            'line-opacity': 0.55,
          },
        },
        {
          id: 'road-major',
          type: 'line',
          source: SRC,
          'source-layer': 'transportation',
          minzoom: 9,
          filter: ['in', 'class', 'primary', 'secondary', 'trunk'],
          paint: {
            'line-color': C.roadMajor,
            'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 12, 1.2, 14, 1.6],
            'line-opacity': 0.65,
          },
        },
        {
          id: 'road-motorway',
          type: 'line',
          source: SRC,
          'source-layer': 'transportation',
          minzoom: 7,
          filter: ['==', 'class', 'motorway'],
          paint: {
            'line-color': C.roadMotorway,
            'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 10, 1.5, 14, 2],
            'line-opacity': 0.75,
          },
        },

        // --- Rail (high visibility, industrial rust) ---
        {
          id: 'rail-casing',
          type: 'line',
          source: SRC,
          'source-layer': 'transportation',
          minzoom: 8,
          filter: ['==', 'class', 'rail'],
          paint: {
            'line-color': C.railCasing,
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 12, 3.5, 14, 5],
            'line-opacity': 0.85,
          },
        },
        {
          id: 'rail-core',
          type: 'line',
          source: SRC,
          'source-layer': 'transportation',
          minzoom: 8,
          filter: ['==', 'class', 'rail'],
          paint: {
            'line-color': C.railCore,
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 12, 1.5, 14, 2.2],
            'line-dasharray': [2, 1.5],
            'line-opacity': 0.95,
          },
        },

        // --- Building footprints (primary structural layer) ---
        {
          id: 'building-footprint',
          type: 'fill',
          source: SRC,
          'source-layer': 'building',
          minzoom: 12,
          paint: {
            'fill-color': C.building,
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.55, 14, 0.88],
            'fill-outline-color': C.buildingOutline,
          },
        },

        // --- Context labels (orientation without consumer-map density) ---
        {
          id: 'label-city',
          type: 'symbol',
          source: SRC,
          'source-layer': 'place',
          minzoom: 5,
          filter: ['==', 'class', 'city'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 13, 12, 15],
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.06,
            'text-max-width': 8,
            'text-padding': 6,
          },
          paint: {
            'text-color': C.labelMajor,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.5,
            'text-opacity': 0.92,
          },
        },
        {
          id: 'label-town',
          type: 'symbol',
          source: SRC,
          'source-layer': 'place',
          minzoom: 7,
          filter: ['in', 'class', 'town'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 10, 12, 13, 13],
            'text-letter-spacing': 0.03,
            'text-max-width': 7,
            'text-padding': 8,
          },
          paint: {
            'text-color': C.label,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.4,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.45, 9, 0.75, 12, 0.9],
          },
        },
        {
          id: 'label-village-orientation',
          type: 'symbol',
          source: SRC,
          'source-layer': 'place',
          minzoom: 10.5,
          filter: ['in', 'class', 'village', 'hamlet'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 9, 13, 11],
            'text-max-width': 6,
            'text-padding': 10,
          },
          paint: {
            'text-color': C.label,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.25,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0.35, 12, 0.7],
          },
        },
        {
          id: 'label-river',
          type: 'symbol',
          source: SRC,
          'source-layer': 'waterway',
          minzoom: 8.5,
          filter: ['all', ['==', 'class', 'river'], ['has', 'name']],
          layout: {
            'symbol-placement': 'line',
            'text-field': ['get', 'name'],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 8.5, 10, 12, 12, 14, 13],
            'text-max-angle': 30,
            'text-padding': 6,
          },
          paint: {
            'text-color': C.labelRiver,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.25,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 8.5, 0.5, 10, 0.85],
          },
        },
        {
          id: 'label-water',
          type: 'symbol',
          source: SRC,
          'source-layer': 'water_name',
          minzoom: 8,
          filter: ['has', 'name'],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 12],
            'text-max-width': 8,
            'text-padding': 10,
          },
          paint: {
            'text-color': C.labelWater,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.2,
            'text-opacity': 0.72,
          },
        },
        {
          id: 'label-highway',
          type: 'symbol',
          source: SRC,
          'source-layer': 'transportation_name',
          minzoom: 7.5,
          filter: ['in', 'class', 'motorway', 'trunk'],
          layout: {
            'symbol-placement': 'line',
            'text-field': ['coalesce', ['get', 'ref'], ['get', 'name']],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 7.5, 9, 11, 10.5, 14, 12],
            'text-letter-spacing': 0.05,
            'text-padding': 12,
          },
          paint: {
            'text-color': C.labelRoad,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.25,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 7.5, 0.55, 10, 0.8],
          },
        },
        {
          id: 'label-primary-road',
          type: 'symbol',
          source: SRC,
          'source-layer': 'transportation_name',
          minzoom: 11.5,
          filter: ['in', 'class', 'primary', 'secondary'],
          layout: {
            'symbol-placement': 'line',
            'text-field': ['coalesce', ['get', 'ref'], ['get', 'name']],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 9, 14, 10.5],
            'text-letter-spacing': 0.03,
            'text-padding': 18,
          },
          paint: {
            'text-color': C.labelRoad,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.15,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0.35, 13, 0.68],
          },
        },
        {
          id: 'label-rail',
          type: 'symbol',
          source: SRC,
          'source-layer': 'transportation_name',
          minzoom: 10,
          filter: ['==', 'class', 'rail'],
          layout: {
            'symbol-placement': 'line',
            'text-field': ['get', 'name'],
            'text-font': labelFont,
            'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 13, 10.5],
            'text-letter-spacing': 0.04,
            'text-padding': 18,
          },
          paint: {
            'text-color': C.labelRail,
            'text-halo-color': C.labelHalo,
            'text-halo-width': 1.1,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 12, 0.65],
          },
        },
      ],
    },
  };
}

export { MISSOURI_CENTER, MISSOURI_BOUNDS };

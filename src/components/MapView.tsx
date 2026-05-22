import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

import { normalizeArchiveClass, normalizeSiteType } from '../../shared/archive-meta';
import type { Location, MapStatus } from '../../shared/types';
import {
  PIN_COLOR_EXPRESSION,
  PIN_FILL_OPACITY_EXPRESSION,
  PIN_OPACITY_EXPRESSION,
  PIN_RADIUS_EXPRESSION,
  PIN_RING_EXPRESSION,
} from '../map/pinStyle';
import { buildMapStyle } from '../map/buildMapStyle';
import { easeOutCubic, focusMapOnLocation } from '../map/focusLocation';

export interface MapViewHandle {
  panBy: (dx: number, dy: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getMap: () => maplibregl.Map | null;
}

interface MapViewProps {
  mapStatus: MapStatus | null;
  allLocations: Location[];
  filteredIds: Set<string>;
  selectedId: string | null;
  focusRequest: { id: string; nonce: number } | null;
  pinScale?: number;
  showHistorical?: boolean;
  showNature?: boolean;
  showRumorsFolk?: boolean;
  onSelectLocation: (id: string) => void;
  onAddAtPoint: (lng: number, lat: number) => void;
}

const MARKERS_SOURCE = 'archive-locations';
const MARKERS_RING = 'archive-pins-ring';
const MARKERS_FILL = 'archive-pins-fill';

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    mapStatus,
    allLocations,
    filteredIds,
    selectedId,
    focusRequest,
    pinScale = 1,
    showHistorical = true,
    showNature = true,
    showRumorsFolk = true,
    onSelectLocation,
    onAddAtPoint,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hoveredIdRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    panBy(dx: number, dy: number) {
      mapRef.current?.panBy([dx, dy], { duration: 140, easing: easeOutCubic });
    },
    zoomIn() {
      mapRef.current?.zoomIn({ duration: 240, easing: easeOutCubic });
    },
    zoomOut() {
      mapRef.current?.zoomOut({ duration: 240, easing: easeOutCubic });
    },
    getMap: () => mapRef.current,
  }));

  const buildGeoJson = useCallback((): GeoJSON.FeatureCollection => {
    return {
      type: 'FeatureCollection',
      features: allLocations
        .filter((loc) => {
          const archiveClass = normalizeArchiveClass(loc.archive_class);
          if (!showHistorical && loc.status === 'demolished') return false;
          if (!showNature && archiveClass === 'natural_structure') return false;
          if (
            !showRumorsFolk &&
            (archiveClass === 'rumored_natural_structure' ||
              archiveClass === 'folk_tale_location')
          ) {
            return false;
          }
          return true;
        })
        .map((loc) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [loc.longitude, loc.latitude],
          },
          properties: {
            id: loc.id,
            name: loc.name,
            selected: loc.id === selectedId,
            archiveClass: normalizeArchiveClass(loc.archive_class),
            siteType: normalizeSiteType(loc.type),
            status: loc.status,
            riskLevel: loc.risk_level,
            priorityOverride: loc.priority_override ?? '',
            historical: loc.status === 'demolished',
            filtered: filteredIds.has(loc.id),
          },
        })),
    };
  }, [allLocations, filteredIds, selectedId, showHistorical, showNature, showRumorsFolk]);

  const updateMarkers = useCallback(
    (map: maplibregl.Map) => {
      const geojson = buildGeoJson();
      const source = map.getSource(MARKERS_SOURCE) as maplibregl.GeoJSONSource | undefined;

      if (source) {
        source.setData(geojson);
        return;
      }

      map.addSource(MARKERS_SOURCE, { type: 'geojson', data: geojson, promoteId: 'id' });

      const radiusExpr: maplibregl.ExpressionSpecification = [
        '*',
        PIN_RADIUS_EXPRESSION as maplibregl.ExpressionSpecification,
        pinScale,
      ];

      map.addLayer({
        id: MARKERS_RING,
        type: 'circle',
        source: MARKERS_SOURCE,
        paint: {
          'circle-radius': ['+', radiusExpr, 3],
          'circle-color': 'transparent',
          'circle-stroke-color': PIN_RING_EXPRESSION as maplibregl.ExpressionSpecification,
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            ['get', 'selected'],
            3,
            2,
          ],
          'circle-opacity': PIN_OPACITY_EXPRESSION as maplibregl.ExpressionSpecification,
          'circle-radius-transition': { duration: 110, delay: 0 },
          'circle-stroke-width-transition': { duration: 110, delay: 0 },
          'circle-opacity-transition': { duration: 120, delay: 0 },
        },
      });

      map.addLayer({
        id: MARKERS_FILL,
        type: 'circle',
        source: MARKERS_SOURCE,
        paint: {
          'circle-radius': radiusExpr,
          'circle-color': PIN_COLOR_EXPRESSION as maplibregl.ExpressionSpecification,
          'circle-opacity': PIN_FILL_OPACITY_EXPRESSION as maplibregl.ExpressionSpecification,
          'circle-stroke-color': ['case', ['get', 'historical'], '#6a7078', '#1a1e24'],
          'circle-stroke-width': [
            'case',
            ['get', 'historical'],
            2,
            ['boolean', ['feature-state', 'hover'], false],
            2,
            1,
          ],
          'circle-radius-transition': { duration: 110, delay: 0 },
          'circle-stroke-width-transition': { duration: 110, delay: 0 },
          'circle-opacity-transition': { duration: 120, delay: 0 },
        },
      });

      const setHover = (id: string | null) => {
        if (hoveredIdRef.current) {
          map.setFeatureState(
            { source: MARKERS_SOURCE, id: hoveredIdRef.current },
            { hover: false },
          );
        }
        hoveredIdRef.current = id;
        if (id) {
          map.setFeatureState({ source: MARKERS_SOURCE, id }, { hover: true });
        }
      };

      map.on('click', MARKERS_FILL, (e) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        if (id) onSelectLocation(id);
      });

      map.on('mouseenter', MARKERS_FILL, (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) setHover(id);
      });

      map.on('mouseleave', MARKERS_FILL, () => {
        map.getCanvas().style.cursor = '';
        setHover(null);
      });
    },
    [buildGeoJson, onSelectLocation, pinScale],
  );

  useEffect(() => {
    if (!containerRef.current || !mapStatus) return;

    const { style, center, zoom, minZoom, maxBounds } = buildMapStyle(mapStatus);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center,
      zoom,
      minZoom,
      maxBounds,
      renderWorldCopies: false,
      attributionControl: false,
      dragPan: {
        deceleration: 2100,
        maxSpeed: 1200,
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    map.on('load', () => updateMarkers(map));
    map.on('error', (e) => {
      console.error('[MapView]', e.error?.message ?? e);
    });
    map.on('contextmenu', (e) => {
      e.preventDefault();
      onAddAtPoint(e.lngLat.lng, e.lngLat.lat);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapStatus?.hasTiles, mapStatus?.tileFormat, mapStatus?.mbtilesPath]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) updateMarkers(map);
    else if (map) map.once('load', () => updateMarkers(map));
  }, [
    allLocations,
    filteredIds,
    selectedId,
    showHistorical,
    showNature,
    showRumorsFolk,
    pinScale,
    updateMarkers,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const loc = allLocations.find((l) => l.id === focusRequest?.id);
    if (map && loc) {
      focusMapOnLocation(map, loc.longitude, loc.latitude);
    }
  }, [focusRequest, allLocations]);

  return (
    <div className="map-container">
      <div ref={containerRef} className="map-canvas" />
      {mapStatus && !mapStatus.hasTiles && (
        <div className="map-overlay-hint">
          <p>No offline basemap on file.</p>
          <p>Import a <code>.mbtiles</code> basemap from the Map menu.</p>
        </div>
      )}
    </div>
  );
});

import type { Map } from 'maplibre-gl';

const FOCUS_ZOOM_MIN = 12;
const LOCAL_DISTANCE_SQ = 0.002;
const NEAR_DISTANCE_SQ = 0.018;

function distanceSq(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** Restrained ease-out — operational, not springy. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function focusMapOnLocation(map: Map, lng: number, lat: number): void {
  const center = map.getCenter();
  const distSq = distanceSq([center.lng, center.lat], [lng, lat]);
  const currentZoom = map.getZoom();
  const targetZoom =
    distSq < LOCAL_DISTANCE_SQ && currentZoom >= FOCUS_ZOOM_MIN - 1
      ? currentZoom
      : Math.max(currentZoom, FOCUS_ZOOM_MIN);

  const camera = {
    center: [lng, lat] as [number, number],
    zoom: targetZoom,
    essential: true,
  };

  if (distSq < NEAR_DISTANCE_SQ) {
    map.easeTo({
      ...camera,
      duration: distSq < LOCAL_DISTANCE_SQ ? 300 : 380,
      easing: easeOutCubic,
    });
    return;
  }

  map.flyTo({
    ...camera,
    duration: 460,
    curve: 1.08,
    easing: easeOutCubic,
  });
}

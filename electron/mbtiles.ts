import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import type { MapStatus } from '../shared/types';
import { getArchivePaths } from './archive-path';
import { resolveActiveBasemapPath } from './basemap-resolve';

const TILE_PROTOCOL = 'moarchive';

/** Temporary tile-server diagnostics (dev or MOARCHIVE_DEBUG_TILES=1). */
export const TILE_DEBUG =
  process.env.MOARCHIVE_DEBUG_TILES === '1' || process.env.NODE_ENV !== 'production';

let mbtilesDb: Database.Database | null = null;
let mbtilesPath: string | null = null;
let tileFormat: 'vector' | 'raster' | 'png' | 'jpg' | 'webp' | null = null;
let mapMetadata: Record<string, string> = {};
let sourceLayers: string[] = [];
let minZoom = 0;
let maxZoom = 14;

let debugTileRequestCount = 0;
const DEBUG_TILE_REQUEST_LIMIT = 80;

export interface PreparedTile {
  body: Buffer;
  contentType: string;
  /** Set when serving gzip bytes without decompressing (fallback path). */
  contentEncoding?: string;
  compression: 'gzip' | 'raw' | 'unknown';
  servedAs: 'decompressed' | 'gzip' | 'raw';
  byteLength: number;
}

function findMbtilesFile(): string | null {
  return resolveActiveBasemapPath();
}

function detectFormat(metadata: Record<string, string>): 'vector' | 'raster' {
  const format = (metadata.format ?? '').toLowerCase();
  if (format.includes('pbf') || format === 'mvt') return 'vector';
  return 'raster';
}

function detectTileExtension(metadata: Record<string, string>): string {
  const format = (metadata.format ?? 'pbf').toLowerCase();
  if (format.includes('png')) return 'png';
  if (format.includes('jpg') || format.includes('jpeg')) return 'jpg';
  if (format.includes('webp')) return 'webp';
  if (format.includes('pbf') || format === 'mvt') return 'pbf';
  return 'pbf';
}

function isGzip(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function looksLikeMvt(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  // MVT layers are length-delimited protobuf messages; first byte is often 0x1a.
  return buffer[0] === 0x1a || buffer[0] === 0x0a;
}

function parseMetadataExtras(metadata: Record<string, string>): void {
  minZoom = parseInt(metadata.minzoom ?? '0', 10) || 0;
  maxZoom = parseInt(metadata.maxzoom ?? '14', 10) || 14;
  sourceLayers = [];

  const jsonRaw = metadata.json;
  if (!jsonRaw) return;

  try {
    const parsed = JSON.parse(jsonRaw) as {
      vector_layers?: Array<{ id: string }>;
    };
    if (Array.isArray(parsed.vector_layers)) {
      sourceLayers = parsed.vector_layers.map((l) => l.id).filter(Boolean);
    }
  } catch {
    // non-OpenMapTiles metadata
  }
}

function logMbtilesInit(file: string, metadata: Record<string, string>, format: 'vector' | 'raster'): void {
  if (!TILE_DEBUG) return;
  console.info('[moarchive:mbtiles] loaded', {
    file: path.basename(file),
    format: metadata.format,
    detected: format,
    minZoom,
    maxZoom,
    contentType: format === 'vector' ? 'application/x-protobuf' : detectTileExtension(metadata),
    sourceLayers: sourceLayers.length ? sourceLayers : '(none in metadata.json)',
    name: metadata.name,
    type: metadata.type,
  });
}

function logTileRequest(
  z: number,
  x: number,
  y: number,
  prepared: PreparedTile | null,
  found: boolean,
): void {
  if (!TILE_DEBUG) return;
  debugTileRequestCount += 1;
  if (debugTileRequestCount > DEBUG_TILE_REQUEST_LIMIT) return;

  const payload = prepared
    ? {
        compression: prepared.compression,
        servedAs: prepared.servedAs,
        contentType: prepared.contentType,
        contentEncoding: prepared.contentEncoding ?? null,
        byteLength: prepared.byteLength,
        mvtLike: looksLikeMvt(prepared.body),
      }
    : null;

  console.info(`[moarchive:tile] ${z}/${x}/${y}`, found ? payload : { status: 'missing' });
}

export function initMbtiles(): MapStatus {
  closeMbtiles();
  const file = findMbtilesFile();
  if (!file) {
    return { hasTiles: false, mbtilesPath: null, tileFormat: null };
  }

  try {
    mbtilesDb = new Database(file, { readonly: true, fileMustExist: true });
    mbtilesPath = file;

    const metaRows = mbtilesDb.prepare('SELECT name, value FROM metadata').all() as {
      name: string;
      value: string;
    }[];
    mapMetadata = {};
    for (const row of metaRows) {
      mapMetadata[row.name] = row.value;
    }

    parseMetadataExtras(mapMetadata);
    const format = detectFormat(mapMetadata);
    tileFormat = format === 'vector' ? 'pbf' : (detectTileExtension(mapMetadata) as typeof tileFormat);

    logMbtilesInit(file, mapMetadata, format);

    return buildMapStatus(true, file, format);
  } catch (err) {
    if (TILE_DEBUG) {
      console.error('[moarchive:mbtiles] init failed', err);
    }
    closeMbtiles();
    return { hasTiles: false, mbtilesPath: null, tileFormat: null };
  }
}

function buildMapStatus(
  hasTiles: boolean,
  file: string | null,
  format: 'vector' | 'raster' | null,
): MapStatus {
  return {
    hasTiles,
    mbtilesPath: file,
    tileFormat: format,
    minZoom,
    maxZoom,
    sourceLayers: sourceLayers.length > 0 ? sourceLayers : undefined,
    tileContentType:
      format === 'vector' ? 'application/x-protobuf' : getTileContentType(),
    basemapFilename: file ? path.basename(file) : null,
  };
}

export function closeMbtiles(): void {
  if (mbtilesDb) {
    mbtilesDb.close();
    mbtilesDb = null;
  }
  mbtilesPath = null;
  tileFormat = null;
  mapMetadata = {};
  sourceLayers = [];
  minZoom = 0;
  maxZoom = 14;
  debugTileRequestCount = 0;
}

export function getMapStatus(): MapStatus {
  if (mbtilesDb && mbtilesPath) {
    const format = tileFormat === 'pbf' ? 'vector' : 'raster';
    return buildMapStatus(true, mbtilesPath, format);
  }
  return initMbtiles();
}

export function getTileProtocol(): string {
  return TILE_PROTOCOL;
}

export function getMapZoomRange(): { minZoom: number; maxZoom: number } {
  return { minZoom, maxZoom };
}

export function getSourceLayers(): string[] {
  return [...sourceLayers];
}

/** TMS row flip for standard XYZ tile requests (MapLibre uses XYZ). */
function flipY(z: number, y: number): number {
  return (1 << z) - 1 - y;
}

export function getTileRaw(z: number, x: number, y: number): Buffer | null {
  if (!mbtilesDb) return null;

  const tmsY = flipY(z, y);
  const row = mbtilesDb
    .prepare(
      'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ? LIMIT 1',
    )
    .get(z, x, tmsY) as { tile_data: Buffer } | undefined;

  return row?.tile_data ?? null;
}

/**
 * OpenMapTiles MBTiles store gzip-compressed MVT. MapLibre rejects gzip magic in the body
 * unless Content-Encoding is set; we decompress server-side for reliable custom-protocol delivery.
 */
export function prepareTilePayload(raw: Buffer): PreparedTile {
  const vector = tileFormat === 'pbf';
  const contentType = vector ? 'application/x-protobuf' : getTileContentType();

  if (isGzip(raw)) {
    try {
      const body = gunzipSync(raw);
      return {
        body,
        contentType,
        compression: 'gzip',
        servedAs: 'decompressed',
        byteLength: body.length,
      };
    } catch (err) {
      if (TILE_DEBUG) {
        console.warn('[moarchive:tile] gunzip failed, serving with Content-Encoding: gzip', err);
      }
      return {
        body: raw,
        contentType,
        contentEncoding: 'gzip',
        compression: 'gzip',
        servedAs: 'gzip',
        byteLength: raw.length,
      };
    }
  }

  return {
    body: raw,
    contentType,
    compression: looksLikeMvt(raw) ? 'raw' : 'unknown',
    servedAs: 'raw',
    byteLength: raw.length,
  };
}

export function getTile(z: number, x: number, y: number): PreparedTile | null {
  const raw = getTileRaw(z, x, y);
  if (!raw) {
    logTileRequest(z, x, y, null, false);
    return null;
  }

  const prepared = prepareTilePayload(raw);
  logTileRequest(z, x, y, prepared, true);
  return prepared;
}

export function getTileContentType(): string {
  switch (tileFormat) {
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/x-protobuf';
  }
}

export function getTileExtension(): string {
  return tileFormat ?? 'pbf';
}

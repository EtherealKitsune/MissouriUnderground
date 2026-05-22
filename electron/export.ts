import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type yazlType from 'yazl';

import type { ExportFormat, ExportProgress, Location, MediaFile } from '../shared/types';
import { getArchivePaths } from './archive-path';
import { listLocations, parseTags } from './database';
import { listMedia } from './media';
import { buildChecksumManifest, writeChecksumsFile } from './moarch-integrity';
import { listTimeline } from './timeline';

const MOARCH_FORMAT_VERSION = 1;
const MOARCH_CREATED_WITH = 'Missouri Underground v0.3.0';
const require = createRequire(import.meta.url);
const yazl = require('yazl') as typeof yazlType;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsv(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportLocations(format: ExportFormat, locationIds?: string[]): string {
  const all = listLocations();
  const locations = locationIds?.length
    ? all.filter((l) => locationIds.includes(l.id))
    : all;

  const { exports: exportsDir } = getArchivePaths();
  fs.mkdirSync(exportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `locations-${timestamp}.${format}`;
  const filepath = path.join(exportsDir, filename);

  let content: string;
  switch (format) {
    case 'gpx':
      content = toGpx(locations);
      break;
    case 'kml':
      content = toKml(locations);
      break;
    case 'geojson':
      content = toGeoJson(locations);
      break;
    case 'csv':
      content = toCsv(locations);
      break;
  }

  fs.writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

export async function exportArchivePackage(
  locationIds?: string[],
  heroMediaIds: Record<string, string | undefined> = {},
  onProgress?: (progress: ExportProgress) => void,
): Promise<string> {
  const all = listLocations();
  const locations = locationIds?.length
    ? all.filter((l) => locationIds.includes(l.id))
    : all;
  const packageEntries = locations.map((loc) => {
    const siteMedia = listMedia(loc.id, 'site');
    const researchMedia = listMedia(loc.id, 'research');
    return {
      loc,
      siteMedia,
      researchMedia,
      heroImage: selectHeroImage(siteMedia, heroMediaIds[loc.id]),
    };
  });
  const total =
    6 +
    packageEntries.reduce(
      (sum, entry) => sum + 2 + (entry.heroImage ? 1 : 0) + entry.researchMedia.length,
      0,
    );
  let current = 0;
  const report = (stage: string, status: ExportProgress['status'] = 'running', exportPath?: string) => {
    onProgress?.({ total, current, stage, status, path: exportPath });
  };
  const advance = (stage: string) => {
    current += 1;
    report(stage);
  };

  const { exports: exportsDir } = getArchivePaths();
  fs.mkdirSync(exportsDir, { recursive: true });
  report('Preparing archive package...');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const root = path.join(exportsDir, `.moarch-build-${timestamp}`);
  const outputPath = path.join(exportsDir, getMoarchFilename(locations));
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  advance('Created temporary package folder.');

  const singleArchive = packageEntries.length === 1;
  const archiveSummaries = packageEntries.map((entry) =>
    buildArchivePackage(entry, root, advance, singleArchive ? '' : undefined),
  );
  const manifest = {
    formatVersion: MOARCH_FORMAT_VERSION,
    archiveUUID: singleArchive ? packageEntries[0]?.loc.archive_uuid : undefined,
    originMachineId: singleArchive ? packageEntries[0]?.loc.origin_machine_id : undefined,
    mapSignature: singleArchive ? packageEntries[0]?.loc.map_signature : undefined,
    signature: null,
    createdWith: MOARCH_CREATED_WITH,
    createdAt: new Date().toISOString(),
    archiveCount: packageEntries.length,
    packageType: 'curated_archival_dossier',
    philosophy: 'metadata, timeline, notes, research media, and one representative hero image',
    excludes: ['site_media_gallery', 'raw_field_video', 'thumbnail_cache', 'temporary_media', 'local_ui_state'],
    archives: archiveSummaries.map(({ checksumPaths: _checksumPaths, ...summary }) => summary),
  };

  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  advance('Building manifest...');

  const checksumPaths = ['manifest.json', ...archiveSummaries.flatMap((summary) => summary.checksumPaths)];
  const checksums = buildChecksumManifest(root, checksumPaths);
  writeChecksumsFile(root, checksums);
  advance('Writing integrity manifest...');
  report('Compressing package...');
  await compressMoarch(root, outputPath, () => advance('Compressing package...'));
  advance('Finalizing .moarch...');
  fs.rmSync(root, { recursive: true, force: true });
  advance('Cleaning temporary files...');
  current = total;
  report('Archive package exported.', 'complete', outputPath);
  return outputPath;
}

function buildArchivePackage(
  entry: {
    loc: Location;
    siteMedia: MediaFile[];
    researchMedia: MediaFile[];
    heroImage: MediaFile | null;
  },
  root: string,
  advance: (stage: string) => void,
  folderNameOverride?: string,
): {
  archive_uuid: string;
  archive_id: string;
  origin_machine_id: string;
  map_signature: string;
  folder: string;
  hero_image: string | null;
  research_count: number;
  checksumPaths: string[];
} {
  const { loc, siteMedia, researchMedia, heroImage } = entry;
  const folderName = folderNameOverride ?? sanitizeFilename(loc.archive_id || loc.id);
  const folder = folderName ? path.join(root, folderName) : root;
  fs.mkdirSync(folder, { recursive: true });
  advance(`Created ${loc.archive_id || loc.name} folder...`);

  const timeline = listTimeline(loc.id);
  const heroFilename = heroImage
    ? copyHeroImage(heroImage, folder, () => advance(`Copying ${loc.archive_id} hero image...`))
    : null;
  const researchFiles = copyResearchMedia(researchMedia, path.join(folder, 'research'), (filename) =>
    advance(`Packaging research media: ${filename}`),
  );

  const archiveJson = {
    export_type: 'curated_archival_dossier',
    export_notes: [
      'Site media gallery is intentionally excluded by default.',
      'Hero image is the only site-media image included as archive identity.',
      'Research media is included as intentional archival context.',
    ],
    archive: {
      id: loc.id,
      archive_uuid: loc.archive_uuid,
      origin_machine_id: loc.origin_machine_id,
      map_signature: loc.map_signature,
      archive_id: loc.archive_id,
      archive_class: loc.archive_class,
      type: loc.type,
      name: loc.name,
      location_text: loc.location_text,
      coordinates: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        audited: Boolean(loc.coordinates_audited),
      },
      status: loc.status,
      risk_level: loc.risk_level,
      priority_override: loc.priority_override,
      tags: parseTags(loc.tags),
      description: loc.description,
      notes: loc.notes,
      structural_notes: loc.structural_notes,
      access_notes: loc.access_notes,
      research_notes: loc.research_notes,
      source_links: loc.source_links,
      building_count: loc.building_count,
      date_added: loc.date_added,
      date_modified: loc.date_modified,
    },
    timeline,
    media: {
      hero_image: heroFilename,
      research: researchFiles,
      excluded_site_media_count: Math.max(0, siteMedia.length - (heroImage ? 1 : 0)),
    },
  };

  fs.writeFileSync(path.join(folder, 'archive.json'), JSON.stringify(archiveJson, null, 2), 'utf-8');
  advance(`Writing ${loc.archive_id} archive.json...`);

  const relPrefix = folderName ? `${folderName}/` : '';
  const checksumPaths = [
    `${relPrefix}archive.json`,
    ...(heroFilename ? [`${relPrefix}${heroFilename}`] : []),
    ...researchFiles.map((filename) => `${relPrefix}${filename}`),
  ].map((entry) => entry.replace(/\\/g, '/'));

  return {
    archive_uuid: loc.archive_uuid,
    archive_id: loc.archive_id,
    origin_machine_id: loc.origin_machine_id,
    map_signature: loc.map_signature,
    folder: folderName || '.',
    hero_image: heroFilename,
    research_count: researchFiles.length,
    checksumPaths,
  };
}

function selectHeroImage(files: MediaFile[], heroMediaId?: string): MediaFile | null {
  return (
    files.find((file) => file.type === 'image' && file.name === heroMediaId) ??
    files.find((file) => file.type === 'image') ??
    null
  );
}

function copyHeroImage(file: MediaFile, folder: string, advance: () => void): string {
  const ext = path.extname(file.name) || '.webp';
  const filename = `hero${ext.toLowerCase()}`;
  fs.copyFileSync(file.path, path.join(folder, filename));
  advance();
  return filename;
}

function copyResearchMedia(
  files: MediaFile[],
  folder: string,
  advance: (filename: string) => void,
): string[] {
  if (files.length === 0) return [];
  fs.mkdirSync(folder, { recursive: true });
  return files.map((file, index) => {
    const filename = `${String(index + 1).padStart(3, '0')}_${sanitizeFilename(file.name)}`;
    fs.copyFileSync(file.path, path.join(folder, filename));
    advance(filename);
    return path.join('research', filename).replace(/\\/g, '/');
  });
}

function sanitizeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'archive';
}

function getMoarchFilename(locations: Location[]): string {
  if (locations.length === 1) {
    return `${sanitizeFilename(locations[0].archive_id || locations[0].id)}.moarch`;
  }
  return 'MISSOURI-UNDERGROUND-ARCHIVE-PACKAGE.moarch';
}

function compressMoarch(sourceFolder: string, outputPath: string, advance: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
    const output = fs.createWriteStream(outputPath);
    const zip = new yazl.ZipFile();
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    output.on('close', () => {
      if (settled) return;
      settled = true;
      advance();
      resolve();
    });
    output.on('error', fail);
    zip.outputStream.on('error', fail);
    zip.outputStream.pipe(output);
    addFolderToZip(zip, sourceFolder, '');
    zip.end();
  });
}

function addFolderToZip(zip: yazlType.ZipFile, folder: string, zipPrefix: string): void {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addFolderToZip(zip, fullPath, zipPath);
    } else if (entry.isFile()) {
      zip.addFile(fullPath, zipPath, { compress: true });
    }
  }
}

function toGpx(locations: Location[]): string {
  const waypoints = locations
    .map((loc) => {
      const desc = [loc.location_text, loc.description, loc.notes].filter(Boolean).join(' | ');
      const tags = parseTags(loc.tags).join(', ');
      return `  <wpt lat="${loc.latitude}" lon="${loc.longitude}">
    <name>${escapeXml(loc.name)}</name>
    <desc>${escapeXml(desc)}</desc>
    <type>${escapeXml(loc.type)}</type>
    <cmt>${escapeXml(tags)}</cmt>
  </wpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Missouri Archive" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}
</gpx>`;
}

function toKml(locations: Location[]): string {
  const placemarks = locations
    .map((loc) => {
      const desc = [
        loc.location_text,
        `Type: ${loc.type}`,
        `Status: ${loc.status}`,
        `Risk: ${loc.risk_level}`,
        loc.description,
        loc.notes,
      ]
        .filter(Boolean)
        .join('\n');

      return `    <Placemark>
      <name>${escapeXml(loc.name)}</name>
      <description>${escapeXml(desc)}</description>
      <Point>
        <coordinates>${loc.longitude},${loc.latitude},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Missouri Archive Export</name>
${placemarks}
  </Document>
</kml>`;
}

function toGeoJson(locations: Location[]): string {
  const features = locations.map((loc) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [loc.longitude, loc.latitude],
    },
    properties: {
      id: loc.id,
      name: loc.name,
      location_text: loc.location_text,
      type: loc.type,
      status: loc.status,
      risk_level: loc.risk_level,
      description: loc.description,
      notes: loc.notes,
      county: loc.county,
      city: loc.city,
      state: loc.state,
      tags: parseTags(loc.tags),
      date_added: loc.date_added,
      date_modified: loc.date_modified,
      source_links: loc.source_links,
    },
  }));

  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

function toCsv(locations: Location[]): string {
  const headers = [
    'id',
    'name',
    'location_text',
    'latitude',
    'longitude',
    'type',
    'status',
    'risk_level',
    'description',
    'notes',
    'county',
    'city',
    'state',
    'date_added',
    'date_modified',
    'tags',
    'source_links',
  ];

  const rows = locations.map((loc) =>
    [
      loc.id,
      loc.name,
      loc.location_text,
      loc.latitude,
      loc.longitude,
      loc.type,
      loc.status,
      loc.risk_level,
      loc.description,
      loc.notes,
      loc.county,
      loc.city,
      loc.state,
      loc.date_added,
      loc.date_modified,
      parseTags(loc.tags).join(';'),
      loc.source_links,
    ]
      .map((v) => escapeCsv(String(v ?? '')))
      .join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

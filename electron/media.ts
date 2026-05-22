import { shell } from 'electron';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

import type { MediaFile, MediaImportProgress } from '../shared/types';
import { getArchivePaths } from './archive-path';
import { getLocation } from './database';
import { loadSettings } from './settings';

type MediaScope = 'site' | 'research';
type ProgressReporter = (progress: MediaImportProgress) => void;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);
const RESEARCH_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

function classifyFile(filename: string): MediaFile['type'] {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'other';
}

function runBinary(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function getFfprobePath(): string | null {
  const probe = ffprobeStatic as unknown as { path?: string };
  return probe.path ?? null;
}

async function getVideoDurationSeconds(filePath: string): Promise<number | undefined> {
  const probePath = getFfprobePath();
  if (!probePath) return undefined;
  try {
    const { stdout } = await runBinary(probePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) ? duration : undefined;
  } catch {
    return undefined;
  }
}

async function extractVideoPoster(src: string, dest: string, duration?: number): Promise<boolean> {
  if (!ffmpegPath) return false;
  const seek = duration && duration > 0 ? Math.max(1, duration * 0.18) : 3;
  try {
    await runBinary(ffmpegPath, [
      '-y',
      '-ss',
      String(seek),
      '-i',
      src,
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-1',
      '-quality',
      '76',
      dest,
    ]);
    return fs.existsSync(dest);
  } catch {
    return false;
  }
}

function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLocationArchiveId(locationId: string): string {
  const loc = getLocation(locationId);
  return loc?.archive_id || locationId;
}

export function getMediaFolder(locationId: string): string {
  const loc = getLocation(locationId);
  const { media } = getArchivePaths();
  const folder = loc?.media_folder || path.join(media, getLocationArchiveId(locationId));
  ensureDir(path.join(folder, 'site'));
  ensureDir(path.join(folder, 'research'));
  ensureDir(path.join(folder, 'thumbnails'));
  return ensureDir(folder);
}

function getScopedFolder(locationId: string, scope: MediaScope): string {
  return ensureDir(path.join(getMediaFolder(locationId), scope));
}

function getThumbFolder(locationId: string): string {
  return ensureDir(path.join(getMediaFolder(locationId), 'thumbnails'));
}

function getNextIndex(folder: string, archiveId: string, doc = false): number {
  const prefix = doc ? `${archiveId}_DOC_` : `${archiveId}_`;
  const nums = fs.existsSync(folder)
    ? fs
        .readdirSync(folder)
        .map((name) => {
          if (!name.startsWith(prefix)) return 0;
          const match = name.slice(prefix.length).match(/^(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
    : [];
  return Math.max(0, ...nums) + 1;
}

function formatIndex(n: number): string {
  return String(n).padStart(3, '0');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function unlinkWithRetry(filePath: string): Promise<boolean> {
  const delays = [0, 60, 160, 320];
  for (const delay of delays) {
    if (delay > 0) await wait(delay);
    try {
      if (!fs.existsSync(filePath)) return false;
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EBUSY' && code !== 'EPERM') throw err;
    }
  }
  fs.rmSync(filePath, { force: true });
  return true;
}

export function listMedia(locationId: string, scope: MediaScope = 'site'): MediaFile[] {
  const folder = getScopedFolder(locationId, scope);
  const thumbFolder = getThumbFolder(locationId);
  if (!fs.existsSync(folder)) return [];

  return fs
    .readdirSync(folder)
    .filter((f) => !f.startsWith('.'))
    .map((name) => {
      const filePath = path.join(folder, name);
      const type = classifyFile(name);
      const stem = path.basename(name, path.extname(name));
      const metadataPath = path.join(thumbFolder, `${stem}.json`);
      let durationSeconds: number | undefined;
      if (type === 'video' && fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as {
            durationSeconds?: number;
          };
          durationSeconds = metadata.durationSeconds;
        } catch {
          durationSeconds = undefined;
        }
      }
      return {
        name,
        path: filePath,
        thumbnailPath:
          type === 'image'
            ? path.join(thumbFolder, `${stem}.webp`)
            : type === 'video'
              ? path.join(thumbFolder, `${stem}_thumb.webp`)
              : undefined,
        type,
        scope,
        durationSeconds,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createThumbnail(src: string, dest: string): Promise<void> {
  await sharp(src)
    .rotate()
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 76 })
    .toFile(dest);
}

async function importSiteImage(
  locationId: string,
  src: string,
  archiveId: string,
  index: number,
  total: number,
  current: number,
  progress?: ProgressReporter,
): Promise<MediaFile | null> {
  const ext = path.extname(src).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return null;

  const folder = getScopedFolder(locationId, 'site');
  const thumbFolder = getThumbFolder(locationId);
  const stem = `${archiveId}_${formatIndex(index)}`;
  const dest = path.join(folder, `${stem}.webp`);
  const thumbDest = path.join(thumbFolder, `${stem}.webp`);

  progress?.({
    locationId,
    scope: 'site',
    total,
    current,
    stage: 'importing',
    filename: path.basename(src),
  });
  await sharp(src).rotate().webp({ quality: 90 }).toFile(dest);

  progress?.({
    locationId,
    scope: 'site',
    total,
    current,
    stage: 'thumbnailing',
    filename: path.basename(dest),
  });
  await createThumbnail(dest, thumbDest);

  if (loadSettings().mediaImportMode === 'move') {
    fs.rmSync(src, { force: true });
  }

  return {
    name: path.basename(dest),
    path: dest,
    thumbnailPath: thumbDest,
    type: 'image',
    scope: 'site',
  };
}

async function importSiteVideo(
  locationId: string,
  src: string,
  archiveId: string,
  index: number,
  total: number,
  current: number,
  progress?: ProgressReporter,
): Promise<MediaFile | null> {
  const ext = path.extname(src).toLowerCase();
  if (!VIDEO_EXT.has(ext)) return null;

  const folder = getScopedFolder(locationId, 'site');
  const thumbFolder = getThumbFolder(locationId);
  const stem = `${archiveId}_${formatIndex(index)}`;
  const dest = path.join(folder, `${stem}${ext}`);
  const posterDest = path.join(thumbFolder, `${stem}_thumb.webp`);
  const metadataDest = path.join(thumbFolder, `${stem}.json`);

  progress?.({
    locationId,
    scope: 'site',
    total,
    current,
    stage: 'importing',
    filename: path.basename(src),
  });

  if (loadSettings().mediaImportMode === 'move') {
    fs.renameSync(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }

  progress?.({
    locationId,
    scope: 'site',
    total,
    current,
    stage: 'metadata',
    filename: path.basename(dest),
  });
  const durationSeconds = await getVideoDurationSeconds(dest);
  fs.writeFileSync(metadataDest, JSON.stringify({ durationSeconds: durationSeconds ?? null }, null, 2));

  progress?.({
    locationId,
    scope: 'site',
    total,
    current,
    stage: 'thumbnailing',
    filename: path.basename(dest),
  });
  const posterOk = await extractVideoPoster(dest, posterDest, durationSeconds);
  if (!posterOk) {
    await sharp({
      create: {
        width: 480,
        height: 270,
        channels: 3,
        background: '#161b22',
      },
    })
      .webp({ quality: 70 })
      .toFile(posterDest);
  }

  return {
    name: path.basename(dest),
    path: dest,
    thumbnailPath: posterDest,
    type: 'video',
    scope: 'site',
    durationSeconds,
  };
}

function importResearchFile(
  locationId: string,
  src: string,
  archiveId: string,
  index: number,
  total: number,
  current: number,
  progress?: ProgressReporter,
): MediaFile | null {
  const ext = path.extname(src).toLowerCase();
  if (!RESEARCH_EXT.has(ext)) return null;

  const folder = getScopedFolder(locationId, 'research');
  const dest = path.join(folder, `${archiveId}_DOC_${formatIndex(index)}${ext}`);
  progress?.({
    locationId,
    scope: 'research',
    total,
    current,
    stage: 'importing',
    filename: path.basename(src),
  });
  if (loadSettings().mediaImportMode === 'move') {
    fs.renameSync(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }

  return {
    name: path.basename(dest),
    path: dest,
    type: classifyFile(dest),
    scope: 'research',
  };
}

export async function addMediaFiles(
  locationId: string,
  filePaths: string[],
  scope: MediaScope = 'site',
  progress?: ProgressReporter,
): Promise<MediaFile[]> {
  const folder = getScopedFolder(locationId, scope);
  const archiveId = getLocationArchiveId(locationId);
  const added: MediaFile[] = [];
  let index = getNextIndex(folder, archiveId, scope === 'research');
  const importable = filePaths.filter((src) => fs.existsSync(src));
  const total = importable.length;

  for (const [i, src] of importable.entries()) {
    const current = i + 1;
    const file =
      scope === 'site'
        ? (await importSiteImage(locationId, src, archiveId, index, total, current, progress)) ??
          (await importSiteVideo(locationId, src, archiveId, index, total, current, progress))
        : importResearchFile(locationId, src, archiveId, index, total, current, progress);
    if (file) {
      added.push(file);
      index += 1;
    }
  }

  progress?.({
    locationId,
    scope,
    total,
    current: total,
    stage: 'complete',
  });

  return added;
}

export async function deleteMediaFile(
  locationId: string,
  filename: string,
  scope: MediaScope = 'site',
): Promise<boolean> {
  const folder = getScopedFolder(locationId, scope);
  const filePath = path.join(folder, filename);
  if (!fs.existsSync(filePath)) return false;
  const deleted = await unlinkWithRetry(filePath);
  if (scope === 'site') {
    const stem = path.basename(filename, path.extname(filename));
    const thumb =
      classifyFile(filename) === 'video'
        ? path.join(getThumbFolder(locationId), `${stem}_thumb.webp`)
        : path.join(getThumbFolder(locationId), `${stem}.webp`);
    const metadata = path.join(getThumbFolder(locationId), `${stem}.json`);
    if (fs.existsSync(thumb)) await unlinkWithRetry(thumb);
    if (fs.existsSync(metadata)) await unlinkWithRetry(metadata);
  }
  return deleted;
}

export function openMediaFolder(locationId: string, scope?: MediaScope): void {
  const folder = scope ? getScopedFolder(locationId, scope) : getMediaFolder(locationId);
  shell.openPath(folder);
}

export function openMediaFile(filePath: string): Promise<string> {
  return shell.openPath(filePath);
}

export function getMediaFileUrl(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return pathToFileURL(filePath).toString();
}

export function getMediaDataUrl(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.gif'
        ? 'image/gif'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
  const data = fs.readFileSync(filePath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

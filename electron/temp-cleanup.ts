import fs from 'node:fs';
import path from 'node:path';

import { getWorkstationConfigDir } from './workstation-config';

const CLEANUP_RETRY_DELAYS_MS = [150, 300, 600];
const CLEANUP_QUEUE_FILE = 'moarch-cleanup-queue.json';

export const TEMP_CLEANUP_DELAYED_MESSAGE =
  'Temporary import cleanup was delayed.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFileLockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ENOTEMPTY';
}

function cleanupQueuePath(): string {
  return path.join(getWorkstationConfigDir(), CLEANUP_QUEUE_FILE);
}

function readCleanupQueue(): string[] {
  const queuePath = cleanupQueuePath();
  if (!fs.existsSync(queuePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  } catch {
    return [];
  }
}

function writeCleanupQueue(entries: string[]): void {
  const queuePath = cleanupQueuePath();
  const unique = [...new Set(entries.map((entry) => path.normalize(entry)))];
  if (unique.length === 0) {
    if (fs.existsSync(queuePath)) {
      try {
        fs.unlinkSync(queuePath);
      } catch {
        // Non-fatal queue maintenance.
      }
    }
    return;
  }

  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, JSON.stringify(unique, null, 2));
}

export function enqueueDeferredCleanup(targetPath: string): void {
  const normalized = path.normalize(targetPath);
  const queue = readCleanupQueue();
  if (!queue.includes(normalized)) {
    writeCleanupQueue([...queue, normalized]);
  }
}

/**
 * Best-effort temp path removal with Windows-friendly lock retries.
 * Returns true when the path no longer exists.
 */
export async function removePathResilient(
  targetPath: string,
  options?: { enqueueOnFailure?: boolean },
): Promise<boolean> {
  const enqueueOnFailure = options?.enqueueOnFailure !== false;
  if (!targetPath?.trim() || !fs.existsSync(targetPath)) {
    return true;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= CLEANUP_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(CLEANUP_RETRY_DELAYS_MS[attempt - 1]!);
    }

    try {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
      if (!fs.existsSync(targetPath)) {
        return true;
      }
    } catch (err) {
      lastError = err;
      if (!isFileLockError(err)) {
        console.warn('[moarchive:cleanup] temp removal failed', targetPath, err);
      }
    }
  }

  console.warn('[moarchive:cleanup] temp removal deferred', targetPath, lastError);
  if (enqueueOnFailure) {
    enqueueDeferredCleanup(targetPath);
  }
  return false;
}

export async function runDeferredCleanup(): Promise<void> {
  const queue = readCleanupQueue();
  if (queue.length === 0) return;

  const remaining: string[] = [];
  for (const targetPath of queue) {
    const removed = await removePathResilient(targetPath, { enqueueOnFailure: false });
    if (!removed) {
      remaining.push(targetPath);
    }
  }
  writeCleanupQueue(remaining);
}

export async function cleanupTempPath(
  targetPath: string,
): Promise<{ removed: boolean; warning?: string }> {
  const removed = await removePathResilient(targetPath);
  return removed ? { removed: true } : { removed: false, warning: TEMP_CLEANUP_DELAYED_MESSAGE };
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { MoarchIntegrityStatus } from '../shared/types';

export interface MoarchIntegrityReport {
  status: MoarchIntegrityStatus;
  issues: string[];
}

export function hashFileSha256(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function buildChecksumManifest(
  basePath: string,
  relativePaths: string[],
): Record<string, string> {
  const checksums: Record<string, string> = {};
  for (const relativePath of relativePaths) {
    const normalized = relativePath.replace(/\\/g, '/');
    const filePath = path.join(basePath, normalized);
    if (fs.existsSync(filePath)) {
      checksums[normalized] = hashFileSha256(filePath);
    }
  }
  return checksums;
}

export function verifyChecksumManifest(
  basePath: string,
  checksums: Record<string, string> | undefined,
): MoarchIntegrityReport {
  if (!checksums || Object.keys(checksums).length === 0) {
    return { status: 'unknown', issues: [] };
  }

  const issues: string[] = [];
  let missing = 0;
  let mismatched = 0;

  for (const [relativePath, expected] of Object.entries(checksums)) {
    const normalized = relativePath.replace(/\\/g, '/');
    const filePath = path.join(basePath, normalized);
    if (!fs.existsSync(filePath)) {
      missing += 1;
      issues.push(`Missing: ${normalized}`);
      continue;
    }
    const actual = hashFileSha256(filePath);
    if (actual !== expected.toLowerCase()) {
      mismatched += 1;
      issues.push(`Modified: ${normalized}`);
    }
  }

  if (missing > 0) {
    return { status: 'incomplete', issues };
  }
  if (mismatched > 0) {
    return { status: 'modified', issues };
  }
  return { status: 'verified', issues: [] };
}

export function readChecksumsFile(basePath: string): Record<string, string> | undefined {
  const checksumsPath = path.join(basePath, 'checksums.json');
  if (!fs.existsSync(checksumsPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(checksumsPath, 'utf-8')) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeChecksumsFile(basePath: string, checksums: Record<string, string>): void {
  fs.writeFileSync(path.join(basePath, 'checksums.json'), JSON.stringify(checksums, null, 2), 'utf-8');
}

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';

import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type TrustedSignature,
} from '../shared/types';
import { normalizeWorkstationLayout } from '../shared/workstation-layout';
import {
  getConfigFilePath,
  readWorkstationConfig,
  writeWorkstationConfig,
} from './workstation-config';

export function loadSettings(): AppSettings {
  const configPath = getConfigFilePath();
  if (!fs.existsSync(configPath)) {
    return normalizeSettings();
  }

  try {
    const raw = readWorkstationConfig();
    const settings = normalizeSettings(raw.settings);
    const migrated =
      settings.currentMachineId !== raw.settings?.currentMachineId ||
      settings.mapSignature !== raw.settings?.mapSignature ||
      !Array.isArray(raw.settings?.trustedSignatures);
    if (migrated && raw.workstationInitialized) {
      writeWorkstationConfig({ settings });
    }
    return settings;
  } catch {
    return normalizeSettings();
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized = normalizeSettings(settings);
  writeWorkstationConfig({ settings: normalized });
  return normalized;
}

function normalizeSettings(
  settings: Partial<AppSettings> & {
    homeMachines?: Array<{ machineId: string; label: string }>;
    trustedMachines?: Array<{ machineId: string; label: string; signature?: string }>;
  } = {},
): AppSettings {
  const currentMachineId = normalizeMachineId(settings.currentMachineId) || createMachineId();
  const mapSignature = normalizeMapSignature(settings.mapSignature);
  const rawTrusted = Array.isArray(settings.trustedSignatures)
    ? settings.trustedSignatures
    : Array.isArray(settings.trustedMachines)
      ? settings.trustedMachines
      : Array.isArray(settings.homeMachines)
        ? settings.homeMachines
        : [];
  const trustedSignatures = rawTrusted
    .map(normalizeTrustedSignature)
    .filter(Boolean)
    .filter((entry) => entry!.machineId !== currentMachineId) as TrustedSignature[];

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    currentMachineId,
    mapSignature,
    trustedSignatures,
    ...normalizeWorkstationLayout(settings),
  };
}

function normalizeTrustedSignature(
  entry: Partial<TrustedSignature> & { label?: string },
): TrustedSignature | null {
  const signature = normalizeMapSignature(entry.signature ?? entry.label ?? '');
  if (!signature) return null;
  return {
    machineId: normalizeMachineId(entry.machineId),
    signature,
  };
}

function normalizeMapSignature(value: string | undefined): string {
  return String(value ?? '').trim();
}

function normalizeMachineId(value: string | undefined): string {
  return String(value ?? '')
    .replace(/[^a-f0-9]/gi, '')
    .toUpperCase()
    .slice(0, 12);
}

function createMachineId(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

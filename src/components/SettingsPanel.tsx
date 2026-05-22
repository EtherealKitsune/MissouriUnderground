import { useEffect, useState } from 'react';

import type { AppSettings, BasemapInfo, BasemapInstallProgress, TrustedSignature } from '../../shared/types';
import { LAYOUT_PRESETS, type WorkstationLayoutPreset } from '../../shared/workstation-layout';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onMapReload?: () => Promise<unknown>;
}

export function SettingsPanel({ open, onClose, onMapReload }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [backups, setBackups] = useState<{ filename: string; created: string }[]>([]);
  const [newSignature, setNewSignature] = useState('');
  const [mapSignatureDraft, setMapSignatureDraft] = useState('');
  const [basemapInfo, setBasemapInfo] = useState<BasemapInfo | null>(null);
  const [installProgress, setInstallProgress] = useState<BasemapInstallProgress | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installWarning, setInstallWarning] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const refreshBasemapInfo = () => {
    void window.moArchive.map.info().then(setBasemapInfo);
  };

  useEffect(() => {
    if (!open) return;
    void window.moArchive.settings.get().then((loaded) => {
      setSettings(loaded);
      setMapSignatureDraft(loaded.mapSignature);
    });
    void window.moArchive.backup.list().then((list) =>
      setBackups(list.map((b) => ({ filename: b.filename, created: b.created }))),
    );
    refreshBasemapInfo();
    setInstallError(null);
    setInstallWarning(null);
    setInstallProgress(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return window.moArchive.map.onInstallProgress((progress) => {
      setInstallProgress(progress);
      if (progress.stage === 'error') {
        setInstallError(progress.message ?? 'Basemap installation failed.');
      }
    });
  }, [open]);

  if (!open || !settings) return null;

  const save = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const next = { ...settings, ...patch };
    setSettings(next);
    return window.moArchive.settings.save(next);
  };

  const handleInstallBasemap = async () => {
    setInstallError(null);
    setInstallWarning(null);
    setInstallProgress(null);
    setInstalling(true);
    try {
      const result = await window.moArchive.map.installBasemap();
      if (result.error === 'cancelled') return;
      if (!result.success) {
        setInstallError(result.error ?? 'Basemap import failed.');
        return;
      }
      if (result.warning) {
        setInstallWarning(result.warning);
      }
      await onMapReload?.();
      refreshBasemapInfo();
    } finally {
      setInstalling(false);
    }
  };

  const handleReloadMaps = async () => {
    await onMapReload?.();
    refreshBasemapInfo();
  };

  const currentBasemap = basemapInfo?.activeBasemap ?? null;

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-panel">
        <header className="settings-header">
          <h2>Workstation Settings</h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="settings-section">
          <h3>Archive</h3>
          <button
            type="button"
            className="btn-sm"
            onClick={() => void window.moArchive.archive.chooseRoot()}
          >
            Change archive folder…
          </button>
        </section>

        <section className="settings-section">
          <h3>Provenance</h3>
          <p className="settings-hint">
            Cartographic authorship signatures for archival provenance. Archives from untrusted origins appear as shared.
          </p>
          <label className="field map-signature-field">
            <span className="field-label">Map Signature</span>
            <div className="map-signature-row">
              <input
                value={mapSignatureDraft}
                onChange={(e) => setMapSignatureDraft(e.target.value)}
                placeholder="Signature..."
              />
              <button
                type="button"
                className="btn-sm"
                disabled={mapSignatureDraft.trim() === settings.mapSignature}
                onClick={() => {
                  const trimmed = mapSignatureDraft.trim();
                  void save({ mapSignature: trimmed }).then((saved) => {
                    setMapSignatureDraft(saved.mapSignature);
                  });
                }}
              >
                Save Signature
              </button>
            </div>
          </label>
          <span className="field-label">Trusted Signatures</span>
          <div className="trusted-signature-list">
            {settings.trustedSignatures.length === 0 && (
              <p className="settings-hint">No trusted signatures configured.</p>
            )}
            {settings.trustedSignatures.map((entry) => (
              <div key={signatureKey(entry)} className="trusted-signature-row">
                <input
                  value={entry.signature}
                  onChange={(e) =>
                    void save({
                      trustedSignatures: updateSignature(
                        settings.trustedSignatures,
                        entry,
                        e.target.value,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    void save({
                      trustedSignatures: settings.trustedSignatures.filter(
                        (item) => signatureKey(item) !== signatureKey(entry),
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="trusted-signature-add">
            <input
              value={newSignature}
              onChange={(e) => setNewSignature(e.target.value)}
              placeholder="Signature"
            />
            <button
              type="button"
              className="btn-sm"
              onClick={() => {
                const signature = newSignature.trim();
                if (!signature) return;
                const next = upsertSignature(settings.trustedSignatures, { machineId: '', signature });
                setNewSignature('');
                void save({ trustedSignatures: next });
              }}
            >
              Add Trusted Signature
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Workstation Layout</h3>
          <p className="settings-hint">
            Panel widths are stored locally on this workstation. Drag the dividers between panels to adjust.
          </p>
          <span className="field-label">Width preset</span>
          <div className="layout-preset-row">
            {(Object.keys(LAYOUT_PRESETS) as WorkstationLayoutPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                className={`btn-sm layout-preset-btn ${settings.layoutPreset === preset ? 'active' : ''}`}
                onClick={() =>
                  void save({
                    sidebarWidth: LAYOUT_PRESETS[preset].sidebarWidth,
                    dossierWidth: LAYOUT_PRESETS[preset].dossierWidth,
                    layoutPreset: preset,
                  })
                }
              >
                {LAYOUT_PRESETS[preset].label}
              </button>
            ))}
          </div>
          <p className="settings-hint layout-width-readout">
            Index {settings.sidebarWidth}px · Dossier {settings.dossierWidth}px
          </p>
        </section>

        <section className="settings-section">
          <h3>Media</h3>
          <label className="field">
            <span className="field-label">Media Import Behavior</span>
            <select
              value={settings.mediaImportMode}
              onChange={(e) => void save({ mediaImportMode: e.target.value as AppSettings['mediaImportMode'] })}
            >
              <option value="copy">Copy Selected Media</option>
              <option value="move">Move Selected Media</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h3>Offline Maps</h3>
          <div className="basemap-info">
            <span className="field-label">Offline Basemap</span>
            <div className="basemap-readout">
              <div className="basemap-readout-row">
                <span className="basemap-readout-label">Current:</span>
                <span className="basemap-readout-value">
                  {currentBasemap ?? '—'}
                </span>
              </div>
              <div className="basemap-readout-row">
                <span className="basemap-readout-label">Location:</span>
                <span className="basemap-readout-value basemap-path">
                  {basemapInfo?.mapsFolderLabel ?? 'archive/maps/'}
                </span>
              </div>
            </div>
          </div>

          {installProgress && installProgress.stage !== 'error' && (
            <BasemapInstallProgressView progress={installProgress} />
          )}

          {installWarning && (
            <p className="settings-hint basemap-install-warning">{installWarning}</p>
          )}

          {installError && (
            <div className="basemap-install-error" role="alert">
              <strong>Basemap Import Failed</strong>
              <p>{installError}</p>
            </div>
          )}

          <div className="basemap-actions">
            <button
              type="button"
              className="btn-sm"
              disabled={installing}
              onClick={() => void handleInstallBasemap()}
            >
              Import .mbtiles…
            </button>
            <button
              type="button"
              className="btn-sm"
              disabled={installing}
              onClick={() => void handleReloadMaps()}
            >
              Reload Basemap
            </button>
            <button
              type="button"
              className="btn-sm"
              disabled={installing}
              onClick={() => void window.moArchive.map.openMapsFolder()}
            >
              Open Maps Folder
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Map</h3>
          <label className="field">
            <span className="field-label">Pin scale</span>
            <input
              type="range"
              min={0.7}
              max={1.4}
              step={0.05}
              value={settings.pinScale}
              onChange={(e) => void save({ pinScale: parseFloat(e.target.value) })}
            />
          </label>
        </section>

        <section className="settings-section">
          <h3>Backup</h3>
          <ul className="backup-list">
            {backups.slice(0, 5).map((b) => (
              <li key={b.filename}>
                <span>{b.filename}</span>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => void window.moArchive.backup.restore(b.filename)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-sm" onClick={() => void window.moArchive.backup.openFolder()}>
            Open backups folder
          </button>
        </section>

        <section className="settings-section">
          <h3>Controls</h3>
          <p className="settings-hint">
            WASD pan · Z/X zoom · C new pin · Ctrl+E confirm · Ctrl+F search · Ctrl+Q×2 delete
          </p>
        </section>
      </div>
    </div>
  );
}

function BasemapInstallProgressView({ progress }: { progress: BasemapInstallProgress }) {
  const pct =
    progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.copiedBytes / progress.totalBytes) * 100))
      : progress.stage === 'complete'
        ? 100
        : 0;
  const statusLabel =
    progress.stage === 'validating'
      ? 'Validating…'
      : progress.stage === 'copying'
        ? 'Copying…'
        : progress.stage === 'complete'
          ? 'Complete'
          : 'Importing…';

  return (
    <div className="basemap-install-progress">
      <div className="basemap-install-header">
        <span>Importing Basemap…</span>
        <span>{pct}%</span>
      </div>
      <div className="basemap-progress-track" aria-hidden="true">
        <div className="basemap-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="basemap-install-stage">
        <span className="basemap-install-file">{progress.filename}</span>
        <span>{statusLabel}</span>
      </div>
    </div>
  );
}

function signatureKey(entry: TrustedSignature): string {
  return entry.machineId || entry.signature;
}

function updateSignature(
  entries: TrustedSignature[],
  current: TrustedSignature,
  signature: string,
): TrustedSignature[] {
  const nextSignature = signature.trim();
  if (!nextSignature) return entries;
  return entries.map((entry) =>
    signatureKey(entry) === signatureKey(current) ? { ...entry, signature: nextSignature } : entry,
  );
}

function upsertSignature(entries: TrustedSignature[], next: TrustedSignature): TrustedSignature[] {
  const existing = entries.find((entry) => entry.signature.toLowerCase() === next.signature.toLowerCase());
  if (existing) {
    return entries.map((entry) =>
      entry.signature.toLowerCase() === next.signature.toLowerCase() ? { ...entry, ...next } : entry,
    );
  }
  return [...entries, next];
}

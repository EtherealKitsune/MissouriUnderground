import { useEffect, useState } from 'react';

import {
  LAYOUT_PRESETS,
  type WorkstationLayoutPreset,
} from '../../shared/workstation-layout';
import type { WorkstationSetupDefaults, WorkstationSetupInput } from '../../shared/setup-types';

interface WorkstationSetupProps {
  defaults: WorkstationSetupDefaults;
  onComplete: () => void;
}

const STEPS = [
  'Welcome',
  'Archive Storage',
  'Map Signature',
  'Offline Maps',
  'Workstation Layout',
] as const;

export function WorkstationSetup({ defaults, onComplete }: WorkstationSetupProps) {
  const [step, setStep] = useState(0);
  const [archiveRoot, setArchiveRoot] = useState(defaults.defaultArchiveRoot);
  const [mapSignature, setMapSignature] = useState('');
  const [mapsRoot, setMapsRoot] = useState(defaults.defaultMapsRoot);
  const [detectedMbtiles, setDetectedMbtiles] = useState<string[]>(defaults.detectedMbtiles);
  const [mapsMode, setMapsMode] = useState<'default' | 'custom' | 'skip'>('default');
  const [layoutPreset, setLayoutPreset] = useState<WorkstationLayoutPreset>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMapsRoot(`${archiveRoot.replace(/[/\\]+$/, '')}/maps`);
  }, [archiveRoot]);

  useEffect(() => {
    if (step !== 3 || mapsMode === 'skip') return;
    const dir =
      mapsMode === 'custom' ? mapsRoot : `${archiveRoot.replace(/[/\\]+$/, '')}/maps`;
    void refreshMapsScan(dir);
  }, [step, mapsMode, mapsRoot, archiveRoot]);

  const refreshMapsScan = async (dir: string) => {
    const files = await window.moArchive.setup.scanMapsDirectory(dir);
    setDetectedMbtiles(files);
  };

  const pickArchiveRoot = async () => {
    const picked = await window.moArchive.setup.pickDirectory(
      'Choose archive storage location',
      archiveRoot,
    );
    if (picked) setArchiveRoot(picked);
  };

  const pickMapsRoot = async () => {
    const picked = await window.moArchive.setup.pickDirectory('Choose offline maps directory', mapsRoot);
    if (!picked) return;
    setMapsRoot(picked);
    setMapsMode('custom');
    await refreshMapsScan(picked);
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: WorkstationSetupInput = {
        archiveRoot,
        mapSignature,
        layoutPreset,
        initializeMapsFolder: mapsMode !== 'skip',
        mapsRoot:
          mapsMode === 'skip' ? undefined : mapsMode === 'custom' ? mapsRoot : `${archiveRoot.replace(/[/\\]+$/, '')}/maps`,
      };
      await window.moArchive.setup.complete(input);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Workstation initialization failed.');
      setBusy(false);
    }
  };

  return (
    <div className="workstation-setup">
      <div className="workstation-setup-panel">
        <header className="workstation-setup-header">
          <span className="workstation-setup-kicker">Initialization</span>
          <h1>Missouri Underground</h1>
          <p className="workstation-setup-step">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </header>

        <div className="workstation-setup-body">
          {step === 0 && (
            <section>
              <p className="workstation-setup-lead">Offline archival field workstation.</p>
              <p className="settings-hint">
                Configure local archive storage, provenance signature, and workstation layout. All data remains on
                this machine.
              </p>
            </section>
          )}

          {step === 1 && (
            <section>
              <span className="field-label">Archive storage</span>
              <p className="settings-hint">
                Database, media, exports, maps, and backups will be stored at this location. External drives and
                custom paths are supported.
              </p>
              <div className="workstation-setup-path-row">
                <code className="workstation-setup-path">{archiveRoot}</code>
                <button type="button" className="btn-sm" onClick={() => void pickArchiveRoot()}>
                  Choose…
                </button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <span className="field-label">Map signature</span>
              <p className="settings-hint">
                Identifies archives exported from this workstation. Used for provenance — not account identity.
              </p>
              <input
                value={mapSignature}
                onChange={(e) => setMapSignature(e.target.value)}
                placeholder="Signature..."
                autoFocus
              />
              <p className="settings-hint workstation-setup-examples">Example: Alias or Name</p>
            </section>
          )}

          {step === 3 && (
            <section>
              <span className="field-label">Offline maps</span>
              <p className="settings-hint">
                Place `.mbtiles` files in the maps folder for offline basemaps. Configuration can be deferred.
              </p>
              <div className="workstation-setup-maps-options">
                <label className="checkbox-field">
                  <input
                    type="radio"
                    name="mapsMode"
                    checked={mapsMode === 'default'}
                    onChange={() => {
                      setMapsMode('default');
                      void refreshMapsScan(`${archiveRoot.replace(/[/\\]+$/, '')}/maps`);
                    }}
                  />
                  <span>Use archive maps folder</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="radio"
                    name="mapsMode"
                    checked={mapsMode === 'custom'}
                    onChange={() => setMapsMode('custom')}
                  />
                  <span>Use custom maps directory</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="radio"
                    name="mapsMode"
                    checked={mapsMode === 'skip'}
                    onChange={() => setMapsMode('skip')}
                  />
                  <span>Skip — configure later</span>
                </label>
              </div>
              {mapsMode !== 'skip' && (
                <>
                  <div className="workstation-setup-path-row">
                    <code className="workstation-setup-path">
                      {mapsMode === 'custom' ? mapsRoot : `${archiveRoot.replace(/[/\\]+$/, '')}/maps`}
                    </code>
                    {mapsMode === 'custom' && (
                      <button type="button" className="btn-sm" onClick={() => void pickMapsRoot()}>
                        Choose…
                      </button>
                    )}
                  </div>
                  {detectedMbtiles.length > 0 ? (
                    <ul className="workstation-setup-mbtiles">
                      {detectedMbtiles.map((file) => (
                        <li key={file}>{file.split(/[/\\]/).pop()}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="settings-hint">No `.mbtiles` detected in this folder.</p>
                  )}
                </>
              )}
            </section>
          )}

          {step === 4 && (
            <section>
              <span className="field-label">Workstation layout</span>
              <p className="settings-hint">Initial panel widths for the archive index and dossier panel.</p>
              <div className="layout-preset-row workstation-setup-presets">
                {(Object.keys(LAYOUT_PRESETS) as WorkstationLayoutPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`btn-sm layout-preset-btn ${layoutPreset === preset ? 'active' : ''}`}
                    onClick={() => setLayoutPreset(preset)}
                  >
                    {LAYOUT_PRESETS[preset].label}
                  </button>
                ))}
              </div>
              <p className="settings-hint layout-width-readout">
                Index {LAYOUT_PRESETS[layoutPreset].sidebarWidth}px · Dossier{' '}
                {LAYOUT_PRESETS[layoutPreset].dossierWidth}px
              </p>
            </section>
          )}

          {error && <p className="workstation-setup-error">{error}</p>}
        </div>

        <footer className="workstation-setup-footer">
          {step > 0 && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          <div className="workstation-setup-footer-spacer" />
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || (step === 1 && !archiveRoot.trim())}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void finish()}>
              {busy ? 'Initializing…' : 'Initialize Workstation'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

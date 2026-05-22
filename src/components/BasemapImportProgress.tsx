import type { BasemapInstallProgress } from '../../shared/types';

interface BasemapImportProgressProps {
  progress: BasemapInstallProgress | null;
  error: string | null;
  onDismiss?: () => void;
}

export function BasemapImportProgressPanel({
  progress,
  error,
  onDismiss,
}: BasemapImportProgressProps) {
  if (!progress && !error) return null;

  if (error && (!progress || progress.stage === 'error')) {
    return (
      <aside className="basemap-import-panel error" aria-live="polite">
        <div className="basemap-install-error" role="alert">
          <strong>Basemap Import Failed</strong>
          <p>{error}</p>
        </div>
        {onDismiss && (
          <div className="basemap-import-actions">
            <button type="button" className="btn-ghost btn-sm" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        )}
      </aside>
    );
  }

  if (!progress) return null;

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
  const done = progress.stage === 'complete';

  return (
    <aside
      className={`basemap-import-panel ${done ? 'complete' : ''}`}
      aria-live="polite"
    >
      <div className="basemap-install-progress">
        <div className="basemap-install-header">
          <span>{done ? 'Basemap Imported' : 'Importing Basemap…'}</span>
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
      {done && onDismiss && (
        <div className="basemap-import-actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </aside>
  );
}

import {
  UNKNOWN_ARCHIVE_ORIGIN,
  type MoarchDuplicateAction,
  type MoarchImportPreview,
  type MoarchIntegrityStatus,
} from '../../shared/types';

interface MoarchImportPanelProps {
  preview: MoarchImportPreview;
  importing: boolean;
  onImport: (duplicateAction: MoarchDuplicateAction) => void;
  onCancel: () => void;
}

export function MoarchImportPanel({
  preview,
  importing,
  onImport,
  onCancel,
}: MoarchImportPanelProps) {
  const hasDuplicate = preview.archives.some((entry) => entry.isDuplicate);
  const invalid = !preview.valid;
  const integrityWarning = preview.integrityStatus === 'modified' || preview.integrityStatus === 'incomplete';

  return (
    <aside
      className={`moarch-import-panel ${invalid ? 'error' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Import archive package"
    >
      <header className="moarch-import-header">
        <div>
          <h2>Receive `.moarch` Package</h2>
          <p className="settings-hint">{preview.packageLabel}</p>
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={importing}>
          Cancel
        </button>
      </header>

      {invalid ? (
        <div className="moarch-import-body">
          <p className="moarch-import-error">Package validation failed.</p>
          <ul className="moarch-import-errors">
            {preview.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="moarch-import-body">
            <IntegrityStatusField status={preview.integrityStatus} />

            {integrityWarning && (
              <section className="moarch-integrity-warning">
                <strong>Archive Integrity Warning</strong>
                <p>This package differs from its original export manifest.</p>
                <p className="settings-hint">
                  Possible causes: modified archive contents, incomplete transfer, corrupted media, or a manually
                  rebuilt package. Importing is still allowed.
                </p>
                {preview.integrityIssues.length > 0 && (
                  <ul className="moarch-import-errors moarch-integrity-issues">
                    {preview.integrityIssues.slice(0, 4).map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {preview.archives.map((entry) => (
              <section key={entry.folderKey || entry.archiveUUID || entry.name} className="moarch-import-preview">
                <span className="field-label">Archive</span>
                <strong>{entry.archiveId}</strong>
                <div className="moarch-import-grid">
                  <PreviewField label="Archived By" value={entry.mapSignature || UNKNOWN_ARCHIVE_ORIGIN} />
                  <PreviewField label="Record" value={entry.name} />
                </div>
                <div className="moarch-import-grid">
                  <PreviewField
                    label="Contains"
                    value={[
                      entry.hasHeroImage ? 'Hero image' : null,
                      `${entry.researchCount} research file${entry.researchCount === 1 ? '' : 's'}`,
                      `${entry.timelineCount} timeline entr${entry.timelineCount === 1 ? 'y' : 'ies'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                  {entry.isDuplicate && (
                    <PreviewField label="Status" value="Duplicate archive UUID detected" tone="warn" />
                  )}
                </div>
              </section>
            ))}
          </div>

          <footer className="moarch-import-actions">
            {hasDuplicate ? (
              <>
                <p className="settings-hint">Duplicate Archive Detected</p>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={importing}
                  onClick={() => onImport('skip')}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  disabled={importing}
                  onClick={() => onImport('separate')}
                >
                  Import As Separate
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={importing}
                  onClick={() => onImport('skip')}
                >
                  {importing ? 'Receiving…' : integrityWarning ? 'Continue Receive' : 'Receive Dossier'}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={importing}
                  onClick={() => onImport('cancel')}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={importing}
                  onClick={() => onImport('skip')}
                >
                  {importing ? 'Receiving…' : integrityWarning ? 'Continue Receive' : 'Receive Dossier'}
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={importing}
                  onClick={() => onImport('cancel')}
                >
                  Cancel
                </button>
              </>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}

function IntegrityStatusField({ status }: { status: MoarchIntegrityStatus }) {
  return (
    <div className={`moarch-import-field integrity-${status}`}>
      <span>Integrity Status</span>
      <strong>{integrityStatusLabel(status)}</strong>
    </div>
  );
}

function integrityStatusLabel(status: MoarchIntegrityStatus): string {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'modified':
      return 'Modified';
    case 'incomplete':
      return 'Incomplete';
    default:
      return 'Unknown';
  }
}

function PreviewField({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className={`moarch-import-field ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

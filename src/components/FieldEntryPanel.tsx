import { useState } from 'react';

import { ARCHIVE_CLASSES, ARCHIVE_CLASS_LABELS, SITE_TYPES } from '../../shared/archive-meta';
import type { LocationInput } from '../../shared/types';

interface FieldEntryPanelProps {
  draft: Partial<LocationInput>;
  onSave: (input: LocationInput) => Promise<void>;
  onCancel: () => void;
}

export function FieldEntryPanel({ draft, onSave, onCancel }: FieldEntryPanelProps) {
  const [name, setName] = useState('');
  const [locationText, setLocationText] = useState('');
  const [archiveClass, setArchiveClass] = useState<string>('structure_site');
  const [type, setType] = useState<string>('industrial');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const tagsJson = await window.moArchive.locations.tagsToJson([]);
      await onSave({
        name: name.trim(),
        location_text: locationText.trim(),
        latitude: draft.latitude ?? 0,
        longitude: draft.longitude ?? 0,
        archive_class: archiveClass,
        type,
        status: 'unknown',
        risk_level: 'unknown',
        priority_override: '',
        description: '',
        notes: '',
        structural_notes: '',
        access_notes: '',
        research_notes: '',
        county: '',
        city: '',
        state: draft.state ?? 'MO',
        tags: tagsJson,
        media_folder: '',
        source_links: '',
        building_count: 0,
        coordinates_audited: 0,
        archive_id: '',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="sidebar sidebar-right archive-card field-entry">
      <header className="archive-card-header">
        <div>
          <h2>Field Survey Entry</h2>
          <p className="archive-card-sub">Capture coordinates — enrich dossier later</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Esc · Cancel
        </button>
      </header>

      <div className="field-entry-body">
        <label className="field">
          <span className="field-label">Site name *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mill complex, tunnel portal, survey landmark…"
            autoFocus
            data-hotkey-scope="form"
          />
        </label>

        <label className="field">
          <span className="field-label">Archive class *</span>
          <select
            value={archiveClass}
            onChange={(e) => setArchiveClass(e.target.value)}
            data-hotkey-scope="form"
          >
            {ARCHIVE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ARCHIVE_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        {archiveClass === 'structure_site' && (
          <label className="field">
            <span className="field-label">Structure type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} data-hotkey-scope="form">
              {SITE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span className="field-label">Location *</span>
          <input
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="Town, county, landmark reference"
            data-hotkey-scope="form"
          />
        </label>

        <p className="coord-display">
          Survey point: {Number(draft.latitude ?? 0).toFixed(5)}, {Number(draft.longitude ?? 0).toFixed(5)}
        </p>

        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !name.trim()}
            onClick={() => void handleSubmit()}
          >
            {saving ? 'Filing…' : 'File Dossier (Ctrl+E)'}
          </button>
        </div>
      </div>
    </aside>
  );
}

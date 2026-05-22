import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ARCHIVE_CLASSES,
  ARCHIVE_CLASS_LABELS,
  PRIORITY_OVERRIDES,
  SITE_TYPES,
  TIMELINE_CATEGORIES,
  normalizeArchiveClass,
  updateArchiveIdPrefix,
} from '../../shared/archive-meta';
import type { Location, LocationInput, MediaFile, TimelineEntry } from '../../shared/types';
import { UNKNOWN_ARCHIVE_ORIGIN } from '../../shared/types';
import { archiveLevelClass, archiveLevelLabel, computeArchiveScore } from '../lib/archiveLevel';
import { ArchivalText } from './ArchivalText';
import { MediaPanel } from './MediaPanel';

const LOCKED_TABS = ['Overview', 'Timeline', 'Supporting Evidence', 'Research Archive'] as const;

const EDIT_TABS = [
  'Overview',
  'Timeline',
  'Supporting Evidence',
  'Research Archive',
  'Research Notes',
  'Structural Notes',
  'Access Notes',
  'General Notes',
] as const;

type TabId = (typeof EDIT_TABS)[number];

interface ArchiveCardProps {
  location: Location;
  trustedMachineIds: string[];
  trustedSignatures: string[];
  onUpdate: (id: string, input: Partial<LocationInput>) => Promise<Location | null>;
  onDelete: (id: string) => void;
  onOpenReference: (archiveId: string) => void;
}

export function ArchiveCard({
  location,
  trustedMachineIds,
  trustedSignatures,
  onUpdate,
  onDelete,
  onOpenReference,
}: ArchiveCardProps) {
  const [tab, setTab] = useState<TabId>('Overview');
  const [form, setForm] = useState<Location>(location);
  const [tagsInput, setTagsInput] = useState('');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [mediaCount, setMediaCount] = useState(0);
  const [heroMediaId, setHeroMediaIdState] = useState<string | null>(null);
  const [effectiveHeroMediaId, setEffectiveHeroMediaId] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const mediaRequestRef = useRef(0);

  const refreshMediaSummary = useCallback(async (heroOverride = heroMediaId) => {
    const requestId = mediaRequestRef.current + 1;
    mediaRequestRef.current = requestId;
    const files = await window.moArchive.media.list(location.id, 'site');
    if (mediaRequestRef.current !== requestId) return;
    setMediaCount(files.length);
    const heroImage = selectHeroImage(files, heroOverride);
    if (!heroImage) {
      setEffectiveHeroMediaId(null);
      setHeroImageUrl(null);
      return;
    }
    const url = await window.moArchive.media.dataUrl(heroImage.path);
    if (mediaRequestRef.current !== requestId) return;
    if (!url) {
      setEffectiveHeroMediaId(null);
      setHeroImageUrl(null);
      return;
    }
    setEffectiveHeroMediaId(getMediaId(heroImage));
    setHeroImageUrl(url);
  }, [heroMediaId, location.id]);

  const setHeroMediaId = useCallback(
    (mediaId: string) => {
      localStorage.setItem(getHeroMediaStorageKey(location.id), mediaId);
      setHeroMediaIdState(mediaId);
    },
    [location.id],
  );

  useEffect(() => {
    setForm(location);
    mediaRequestRef.current += 1;
    setEffectiveHeroMediaId(null);
    setHeroImageUrl(null);
    const storedHeroMediaId = localStorage.getItem(getHeroMediaStorageKey(location.id));
    setHeroMediaIdState(storedHeroMediaId);
    try {
      const tags = JSON.parse(location.tags || '[]') as string[];
      setTagsInput(Array.isArray(tags) ? tags.join(', ') : '');
    } catch {
      setTagsInput('');
    }
    void window.moArchive.timeline.list(location.id).then(setTimeline);
    void refreshMediaSummary(storedHeroMediaId);
  }, [location.id, location.date_modified, refreshMediaSummary]);

  useEffect(() => {
    if (!editing && !LOCKED_TABS.includes(tab as (typeof LOCKED_TABS)[number])) {
      setTab('Overview');
    }
  }, [editing, tab]);

  const score = computeArchiveScore(form, timeline.length, mediaCount);
  const levelClass = archiveLevelClass(score);
  const levelLabel = archiveLevelLabel(score);
  const archiveClass = normalizeArchiveClass(form.archive_class);
  const archiveClassLabel = ARCHIVE_CLASS_LABELS[archiveClass];
  const isSharedArchive =
    Boolean(form.origin_machine_id) &&
    !isTrustedOrigin(form.origin_machine_id, form.map_signature, trustedMachineIds, trustedSignatures);
  const structuralNoteLabel =
    archiveClass === 'natural_structure'
      ? 'Terrain / geological notes'
      : archiveClass === 'rumored_natural_structure'
        ? 'Rumor / confidence notes'
        : archiveClass === 'folk_tale_location'
          ? 'Oral history / folklore notes'
          : 'Structural notes';

  const persist = useCallback(
    async (patch: Partial<LocationInput>) => {
      const tagsJson = patch.tags
        ? patch.tags
        : await window.moArchive.locations.tagsToJson(
            tagsInput
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          );
      const updated = await onUpdate(location.id, { ...patch, tags: tagsJson });
      if (updated) setForm(updated);
    },
    [location.id, onUpdate, tagsInput],
  );

  const persistCurrentForm = useCallback(() => {
    return persist({
      archive_id: form.archive_id,
      name: form.name,
      location_text: form.location_text,
      latitude: form.latitude,
      longitude: form.longitude,
      type: form.type,
      archive_class: form.archive_class,
      status: form.status,
      risk_level: form.risk_level,
      priority_override: form.priority_override,
      description: form.description,
      notes: form.notes,
      structural_notes: form.structural_notes,
      access_notes: form.access_notes,
      research_notes: form.research_notes,
      county: form.county,
      city: form.city,
      state: form.state,
      source_links: form.source_links,
      building_count: form.building_count,
      coordinates_audited: form.coordinates_audited,
    });
  }, [form, persist]);

  const handleBlurSave = () => {
    if (!editing) return;
    void persistCurrentForm();
  };

  const set = <K extends keyof Location>(key: K, value: Location[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (editing && (key === 'archive_class' || key === 'type')) {
        next.archive_id = updateArchiveIdPrefix(
          prev.archive_id,
          prev.state,
          next.archive_class,
          next.type,
        );
      }
      return next;
    });
  };

  const toggleEditLock = () => {
    if (editing) {
      void persistCurrentForm().finally(() => setEditing(false));
    } else {
      setEditing(true);
    }
  };

  const handleHeroImageError = () => {
    mediaRequestRef.current += 1;
    setEffectiveHeroMediaId(null);
    setHeroImageUrl(null);
  };

  return (
    <aside className={`sidebar sidebar-right archive-card ${editing ? 'editing' : 'locked'} ${heroImageUrl ? 'has-hero' : ''}`}>
      <header className="archive-card-header">
        <div className="archive-card-title-block">
          <span className="archive-id">{form.archive_id || '—'}</span>
          <h2>{form.name || 'Untitled site'}</h2>
          <p className="archive-location-line">
            {form.location_text || `${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}`}
          </p>
          {!heroImageUrl && (
            <>
              <span className="archive-class-badge">
                {archiveClassLabel}
              </span>
              <span className={`archive-level archive-level-${levelClass}`}>
                {levelLabel}
              </span>
            </>
          )}
          {isSharedArchive && <span className="archive-origin-badge">Shared</span>}
        </div>
        <button type="button" className="btn-ghost" onClick={toggleEditLock}>
          {editing ? 'Lock Dossier' : 'Edit Dossier'}
        </button>
      </header>

      {heroImageUrl && (
        <ArchiveHeroImage
          src={heroImageUrl}
          name={form.name}
          archiveClassLabel={archiveClassLabel}
          level={levelLabel}
          onError={handleHeroImageError}
        />
      )}

      <ArchiveStatusStrip
        level={levelLabel}
        levelClass={levelClass}
        status={form.status}
        risk={form.risk_level}
        priority={form.priority_override}
        mediaCount={mediaCount}
        eventCount={timeline.length}
      />

      <nav className="archive-tabs" role="tablist">
        {(editing ? EDIT_TABS : LOCKED_TABS).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`archive-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="archive-card-body" onBlur={handleBlurSave}>
        {tab === 'Overview' && (
          <OverviewTab
            form={form}
            set={set}
            tagsInput={tagsInput}
            setTagsInput={setTagsInput}
            editing={editing}
            timelineCount={timeline.length}
            mediaCount={mediaCount}
            hasHero={Boolean(heroImageUrl)}
            onOpenReference={onOpenReference}
          />
        )}
        {tab === 'Timeline' && (
          <TimelineTab
            locationId={location.id}
            entries={timeline}
            onChange={setTimeline}
            editing={editing}
            onOpenReference={onOpenReference}
          />
        )}
        {tab === 'Supporting Evidence' && (
          <MediaPanel
            locationId={location.id}
            variant="site"
            heroMediaId={effectiveHeroMediaId}
            onSetHeroImage={setHeroMediaId}
            onChange={refreshMediaSummary}
          />
        )}
        {tab === 'Research Archive' && (
          <MediaPanel locationId={location.id} variant="research" />
        )}
        {editing && tab === 'Research Notes' && (
          <NoteTab
            label="Research notes"
            value={form.research_notes}
            onChange={(v) => set('research_notes', v)}
            editing={editing}
          />
        )}
        {editing && tab === 'Structural Notes' && (
          <NoteTab
            label={structuralNoteLabel}
            value={form.structural_notes}
            onChange={(v) => set('structural_notes', v)}
            editing={editing}
          />
        )}
        {editing && tab === 'Access Notes' && (
          <NoteTab
            label="Access notes"
            value={form.access_notes}
            onChange={(v) => set('access_notes', v)}
            editing={editing}
          />
        )}
        {editing && tab === 'General Notes' && (
          <NoteTab
            label="General notes"
            value={form.notes}
            onChange={(v) => set('notes', v)}
            editing={editing}
          />
        )}
      </div>

      <footer className="archive-card-footer">
        <button type="button" className="btn-danger btn-sm" onClick={() => onDelete(location.id)}>
          Remove Dossier (Ctrl+Q×2)
        </button>
      </footer>
    </aside>
  );
}

function ArchiveStatusStrip({
  level,
  levelClass,
  status,
  risk,
  priority,
  mediaCount,
  eventCount,
}: {
  level: string;
  levelClass: 'basic' | 'partial' | 'complete';
  status: string;
  risk: string;
  priority: string;
  mediaCount: number;
  eventCount: number;
}) {
  return (
    <section className="archive-status-strip" aria-label="Archive status">
      <StatusCell label="Archive Level" value={level} tone={levelClass} />
      <StatusCell label="Condition" value={status || 'unknown'} />
      <StatusCell label="Risk" value={risk || 'unknown'} tone={risk} />
      <StatusCell label="Priority" value={priority || 'none'} tone={priority ? 'danger' : 'muted'} />
      <StatusCell label="Evidence" value={String(mediaCount)} />
      <StatusCell label="Chronology" value={String(eventCount)} />
    </section>
  );
}

function ArchiveHeroImage({
  src,
  name,
  archiveClassLabel,
  level,
  onError,
}: {
  src: string;
  name: string;
  archiveClassLabel: string;
  level: string;
  onError: () => void;
}) {
  return (
    <section className="archive-hero-media" aria-label="Archive hero media">
      <img src={src} alt={name ? `${name} site media` : 'Archive site media'} loading="lazy" onError={onError} />
      <div className="archive-hero-shade" aria-hidden="true" />
      <div className="archive-hero-meta">
        <span className="archive-hero-kicker">Site Reference</span>
        <div className="archive-hero-badges">
          <span className="archive-hero-class">{archiveClassLabel}</span>
          <strong className="archive-hero-level">{level}</strong>
        </div>
      </div>
    </section>
  );
}

function selectHeroImage(files: MediaFile[], heroMediaId: string | null): MediaFile | null {
  return (
    files.find((file) => file.type === 'image' && getMediaId(file) === heroMediaId) ??
    files.find((file) => file.type === 'image') ??
    null
  );
}

function getMediaId(file: MediaFile): string {
  return file.name;
}

function getHeroMediaStorageKey(locationId: string): string {
  return `mo-underground:hero-media:${locationId}`;
}

function StatusCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`status-cell status-${tone ?? 'default'}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OverviewTab({
  form,
  set,
  tagsInput,
  setTagsInput,
  editing,
  timelineCount,
  mediaCount,
  hasHero,
  onOpenReference,
}: {
  form: Location;
  set: <K extends keyof Location>(key: K, value: Location[K]) => void;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  editing: boolean;
  timelineCount: number;
  mediaCount: number;
  hasHero: boolean;
  onOpenReference: (archiveId: string) => void;
}) {
  const ro = !editing;
  const archiveClass = normalizeArchiveClass(form.archive_class);
  const isStructureSite = archiveClass === 'structure_site';
  const isNatural = archiveClass === 'natural_structure';
  const isRumored = archiveClass === 'rumored_natural_structure';
  const isFolkTale = archiveClass === 'folk_tale_location';

  if (!editing) {
    return (
      <DossierOverview
        form={form}
        archiveClass={archiveClass}
        timelineCount={timelineCount}
        mediaCount={mediaCount}
        hasHero={hasHero}
        onOpenReference={onOpenReference}
      />
    );
  }

  return (
    <div className="tab-panel">
      <Field label="Archive Class">
        <select
          value={archiveClass}
          disabled={ro}
          onChange={(e) => set('archive_class', e.target.value)}
          data-hotkey-scope="form"
        >
          {ARCHIVE_CLASSES.map((c) => (
            <option key={c} value={c}>
              {ARCHIVE_CLASS_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input value={form.name} readOnly={ro} onChange={(e) => set('name', e.target.value)} data-hotkey-scope="form" />
      </Field>
      <Field label="Location">
        <input
          value={form.location_text}
          readOnly={ro}
          onChange={(e) => set('location_text', e.target.value)}
          data-hotkey-scope="form"
        />
      </Field>
      <div className="coord-row">
        <Field label="Lat">
          <input
            type="number"
            step="any"
            readOnly={ro}
            value={form.latitude}
            onChange={(e) => set('latitude', parseFloat(e.target.value))}
            data-hotkey-scope="form"
          />
        </Field>
        <Field label="Lng">
          <input
            type="number"
            step="any"
            readOnly={ro}
            value={form.longitude}
            onChange={(e) => set('longitude', parseFloat(e.target.value))}
            data-hotkey-scope="form"
          />
        </Field>
      </div>
      <div className="field-row">
        {isStructureSite && (
          <>
            <Field label="Structure Type">
              <select value={form.type} disabled={ro} onChange={(e) => set('type', e.target.value)} data-hotkey-scope="form">
                {SITE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Structural Status">
              <select value={form.status} disabled={ro} onChange={(e) => set('status', e.target.value)} data-hotkey-scope="form">
                <option value="active">active</option>
                <option value="demolished">demolished (historical)</option>
                <option value="inaccessible">inaccessible</option>
                <option value="monitored">monitored</option>
                <option value="unknown">unknown</option>
              </select>
            </Field>
          </>
        )}
        <Field label="Risk">
          <select
            value={form.risk_level}
            disabled={ro}
            onChange={(e) => set('risk_level', e.target.value)}
            data-hotkey-scope="form"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="extreme">extreme</option>
            <option value="unknown">unknown</option>
          </select>
        </Field>
      </div>
      {isStructureSite && (
        <>
          <Field label="Priority override">
            <select
              value={form.priority_override}
              disabled={ro}
              onChange={(e) => set('priority_override', e.target.value)}
              data-hotkey-scope="form"
            >
              {PRIORITY_OVERRIDES.map((p) => (
                <option key={p || 'none'} value={p}>
                  {p || 'none'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Building Count">
            <input
              type="number"
              min={0}
              readOnly={ro}
              value={form.building_count}
              onChange={(e) => set('building_count', parseInt(e.target.value, 10) || 0)}
              data-hotkey-scope="form"
            />
          </Field>
        </>
      )}
      {!isStructureSite && (
        <div className="metadata-hint">
          {isNatural && 'Terrain/geological context is prioritized for this natural structure.'}
          {isRumored && 'Source references, rumor notes, and confidence context are prioritized.'}
          {isFolkTale && 'Historical notes, oral history, and folklore references are prioritized.'}
        </div>
      )}
      <Field label="Tags">
        <input value={tagsInput} readOnly={ro} onChange={(e) => setTagsInput(e.target.value)} data-hotkey-scope="form" />
      </Field>
      <Field label="Dossier summary">
        <textarea
          rows={3}
          readOnly={ro}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Brief site summary. Reference related dossiers as {MO-IND-00021}."
          data-hotkey-scope="form"
        />
      </Field>
      <Field label={isStructureSite ? 'Source references' : 'Source references'}>
        <textarea
          rows={2}
          readOnly={ro}
          value={form.source_links}
          onChange={(e) => set('source_links', e.target.value)}
          placeholder="URLs, citations, or cross-references such as {MO-NAT-00004}."
          data-hotkey-scope="form"
        />
      </Field>
    </div>
  );
}

function DossierOverview({
  form,
  archiveClass,
  timelineCount,
  mediaCount,
  hasHero,
  onOpenReference,
}: {
  form: Location;
  archiveClass: ReturnType<typeof normalizeArchiveClass>;
  timelineCount: number;
  mediaCount: number;
  hasHero: boolean;
  onOpenReference: (archiveId: string) => void;
}) {
  const tags = parseTags(form.tags);
  const classLabel = ARCHIVE_CLASS_LABELS[archiveClass];
  const structuralLabel =
    archiveClass === 'structure_site'
      ? 'Structural File'
      : archiveClass === 'natural_structure'
        ? 'Terrain File'
        : archiveClass === 'rumored_natural_structure'
          ? 'Rumor / Source File'
          : 'Oral History File';

  return (
    <div className="dossier-overview">
      <section className="dossier-brief">
        <div>
          <span className="dossier-kicker">{classLabel}</span>
          <h3>{form.name || 'Untitled dossier'}</h3>
          <p>
            <ArchivalText
              text={form.description}
              empty="No dossier summary on file."
              onOpenReference={onOpenReference}
            />
          </p>
        </div>
        <div className="dossier-coordinate-card">
          <span>Coordinates</span>
          <strong>
            {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
          </strong>
          <em>{form.coordinates_audited ? 'audited' : 'unaudited'}</em>
        </div>
      </section>

      <section className="dossier-grid">
        {!hasHero && <DossierField label="Archive Class" value={classLabel} />}
        <DossierField label={archiveClass === 'structure_site' ? 'Structure Type' : 'Classification'} value={form.type} />
        <DossierField label="Condition / Status" value={form.status} />
        <DossierField label="Risk" value={form.risk_level} />
        <DossierField label="Supporting Evidence" value={`${mediaCount} item${mediaCount === 1 ? '' : 's'}`} />
        <DossierField label="Chronology" value={`${timelineCount} entr${timelineCount === 1 ? 'y' : 'ies'}`} />
      </section>

      <section className="dossier-notes-grid">
        <DossierNote title={structuralLabel} body={form.structural_notes} onOpenReference={onOpenReference} />
        <DossierNote title="Access Notes" body={form.access_notes} onOpenReference={onOpenReference} />
        <DossierNote title="Research Notes" body={form.research_notes} onOpenReference={onOpenReference} />
        <DossierNote title="General Notes" body={form.notes} onOpenReference={onOpenReference} />
      </section>

      <section className="dossier-sources">
        <div>
          <span className="field-label">Source references</span>
          <p>
            <ArchivalText
              text={form.source_links}
              empty="No source references on file."
              onOpenReference={onOpenReference}
            />
          </p>
        </div>
        <div>
          <span className="field-label">Tags</span>
          <div className="dossier-tags">
            {tags.length ? tags.map((tag) => <span key={tag}>{tag}</span>) : <span className="archival-empty">none filed</span>}
          </div>
        </div>
      </section>

      <DossierProvenance
        mapSignature={form.map_signature}
        dateAdded={form.date_added}
        dateModified={form.date_modified}
      />
    </div>
  );
}

function DossierProvenance({
  mapSignature,
  dateAdded,
  dateModified,
}: {
  mapSignature: string;
  dateAdded: string;
  dateModified: string;
}) {
  return (
    <section className="dossier-provenance">
      <div className="dossier-provenance-item">
        <span>Archived By</span>
        <strong>{mapSignature || UNKNOWN_ARCHIVE_ORIGIN}</strong>
      </div>
      <div className="dossier-provenance-item">
        <span>Filed</span>
        <strong>{formatArchiveDate(dateAdded)}</strong>
      </div>
      <div className="dossier-provenance-item">
        <span>Modified</span>
        <strong>{formatArchiveDate(dateModified)}</strong>
      </div>
    </section>
  );
}

function formatArchiveDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isTrustedOrigin(
  originMachineId: string,
  mapSignature: string,
  trustedMachineIds: string[],
  trustedSignatures: string[],
): boolean {
  if (originMachineId && trustedMachineIds.includes(originMachineId)) return true;
  if (mapSignature && trustedSignatures.includes(mapSignature)) return true;
  return false;
}

function DossierField({ label, value }: { label: string; value: string }) {
  return (
    <div className="dossier-field">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function DossierNote({
  title,
  body,
  onOpenReference,
}: {
  title: string;
  body: string;
  onOpenReference: (archiveId: string) => void;
}) {
  return (
    <article className="dossier-note">
      <span>{title}</span>
      <p>
        <ArchivalText text={body} empty="No entry on file." onOpenReference={onOpenReference} />
      </p>
    </article>
  );
}

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return tagsJson
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

function NoteTab({
  label,
  value,
  onChange,
  editing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
}) {
  return (
    <div className="tab-panel">
      <Field label={label}>
        <textarea
          rows={12}
          readOnly={!editing}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Field notes. Cross-reference related dossiers as {MO-IND-00021}."
          data-hotkey-scope="form"
        />
      </Field>
    </div>
  );
}

function TimelineTab({
  locationId,
  entries,
  onChange,
  editing,
  onOpenReference,
}: {
  locationId: string;
  entries: TimelineEntry[];
  onChange: (e: TimelineEntry[]) => void;
  editing: boolean;
  onOpenReference: (archiveId: string) => void;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [category, setCategory] = useState<string>('Historical');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const addEntry = async () => {
    if (!title.trim()) return;
    const entry = await window.moArchive.timeline.create({
      location_id: locationId,
      year,
      category,
      title: title.trim(),
      description,
    });
    onChange([...entries, entry].sort((a, b) => a.year - b.year));
    setTitle('');
    setDescription('');
  };

  return (
    <div className="tab-panel timeline-panel">
      <div className="timeline-header">
        <span className="dossier-kicker">Archive Chronology</span>
        <strong>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</strong>
      </div>
      <ul className="timeline-spine">
        {entries.map((e) => (
          <li key={e.id} className="timeline-entry">
            <div className="timeline-entry-year">{e.year}</div>
            <div className="timeline-entry-body">
              <div className="timeline-entry-head">
                <span className="timeline-cat">{e.category}</span>
                <strong>{e.title}</strong>
              </div>
              {e.description && (
                <p>
                  <ArchivalText text={e.description} onOpenReference={onOpenReference} />
                </p>
              )}
            </div>
          </li>
        ))}
        {entries.length === 0 && <li className="timeline-empty">No chronology entries on file.</li>}
      </ul>
      {editing && (
        <div className="timeline-add">
          <div className="field-row">
            <Field label="Year">
              <input
                type="number"
                min={1700}
                max={2100}
                value={year}
                onChange={(ev) => setYear(parseInt(ev.target.value, 10))}
                data-hotkey-scope="form"
              />
            </Field>
            <Field label="Category">
              <select value={category} onChange={(ev) => setCategory(ev.target.value)} data-hotkey-scope="form">
                {TIMELINE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Title">
            <input value={title} onChange={(ev) => setTitle(ev.target.value)} data-hotkey-scope="form" />
          </Field>
          <Field label="Entry description">
            <textarea
              rows={2}
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="Event detail. Reference dossiers as {MO-IND-00021}."
              data-hotkey-scope="form"
            />
          </Field>
          <button type="button" className="btn-primary btn-sm" onClick={() => void addEntry()}>
            Append chronology entry
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

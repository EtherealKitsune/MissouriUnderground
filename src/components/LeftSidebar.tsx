import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { ARCHIVE_CLASSES, ARCHIVE_CLASS_LABELS, SITE_TYPES } from '../../shared/archive-meta';
import type { Location, LocationFilters } from '../../shared/types';

interface LeftSidebarProps {
  locations: Location[];
  allCount: number;
  filters: LocationFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGoTo: (id: string) => void;
  onCopyArchiveId: (archiveId: string) => void;
  onDeleteIntent: (id: string) => void;
  onFiltersChange: (filters: LocationFilters) => void;
  onOpenSettings: () => void;
  searchFocusRef: React.MutableRefObject<(() => void) | null>;
  showHistorical: boolean;
  showNature: boolean;
  showRumorsFolk: boolean;
  onToggleHistorical: (v: boolean) => void;
  onToggleNature: (v: boolean) => void;
  onToggleRumorsFolk: (v: boolean) => void;
}

export function LeftSidebar({
  locations,
  allCount,
  filters,
  selectedId,
  onSelect,
  onGoTo,
  onCopyArchiveId,
  onDeleteIntent,
  onFiltersChange,
  onOpenSettings,
  searchFocusRef,
  showHistorical,
  showNature,
  showRumorsFolk,
  onToggleHistorical,
  onToggleNature,
  onToggleRumorsFolk,
}: LeftSidebarProps) {
  const [search, setSearch] = useState(filters.search ?? '');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    location: Location;
  } | null>(null);

  useEffect(() => {
    searchFocusRef.current = () => searchInputRef.current?.focus();
  }, [searchFocusRef]);

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  useEffect(() => {
    const t = setTimeout(() => {
      onFiltersChange({ ...filters, search: search.trim() || undefined });
    }, 280);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    void Promise.all([
      window.moArchive.locations.allTags(),
      window.moArchive.locations.distinct('status'),
      window.moArchive.locations.distinct('risk_level'),
    ]).then(([t, st, r]) => {
      setTags(t);
      setStatuses(st);
      setRisks(r);
    });
  }, [allCount]);

  const updateFilter = (key: keyof LocationFilters, value: string | undefined) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  const openContextMenu = (e: ReactMouseEvent, location: Location) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, location });
  };

  const runContextAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
    <aside className="sidebar sidebar-left">
      <header className="sidebar-header">
        <div>
          <h1>Missouri Underground</h1>
          <span className="location-count">
            {locations.length} shown · {allCount} total
          </span>
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={onOpenSettings} title="Settings">
          ⚙
        </button>
      </header>

      <section className="panel-section search-section">
        <label className="field-label">Search (Ctrl+F)</label>
        <input
          ref={searchInputRef}
          type="search"
          className="archive-search-input"
          placeholder="Name, MO-IND-00421, location, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-hotkey-scope="form"
        />
      </section>

      <section className="panel-section filters-grid">
        <FilterSelect
          label="Archive Class"
          value={filters.archive_class ?? ''}
          options={[...ARCHIVE_CLASSES]}
          labels={ARCHIVE_CLASS_LABELS}
          onChange={(v) => updateFilter('archive_class', v)}
        />
        <FilterSelect
          label="Type"
          value={filters.type ?? ''}
          options={[...SITE_TYPES]}
          onChange={(v) => updateFilter('type', v)}
        />
        <FilterSelect
          label="Status"
          value={filters.status ?? ''}
          options={statuses}
          onChange={(v) => updateFilter('status', v)}
        />
        <FilterSelect
          label="Risk"
          value={filters.risk_level ?? ''}
          options={risks}
          onChange={(v) => updateFilter('risk_level', v)}
        />
      </section>

      <section className="panel-section filter-toggles">
        <label className="field-label">Map visibility</label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={showHistorical}
            onChange={(e) => onToggleHistorical(e.target.checked)}
          />
          <span>Show Historical</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={showNature}
            onChange={(e) => onToggleNature(e.target.checked)}
          />
          <span>Show Nature</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={showRumorsFolk}
            onChange={(e) => onToggleRumorsFolk(e.target.checked)}
          />
          <span>Show Rumors / Folk Tale</span>
        </label>
      </section>

      {tags.length > 0 && (
        <section className="panel-section">
          <label className="field-label">Tags</label>
          <div className="tag-chips">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-chip ${filters.tags?.includes(tag) ? 'active' : ''}`}
                onClick={() => {
                  const current = filters.tags ?? [];
                  const next = current.includes(tag)
                    ? current.filter((t) => t !== tag)
                    : [...current, tag];
                  onFiltersChange({ ...filters, tags: next.length ? next : undefined });
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel-section list-section">
        <div className="archive-index-header">
          <label className="field-label">Archive index</label>
          <span className="archive-index-count">{locations.length} records</span>
        </div>
        <ul className="location-list archive-index-list">
          {locations.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                ref={selectedId === loc.id ? selectedItemRef : undefined}
                className={`location-item archive-index-row ${selectedId === loc.id ? 'selected' : ''} ${
                  loc.status === 'demolished' ? 'historical' : ''
                }`}
                onClick={() => onSelect(loc.id)}
                onContextMenu={(e) => openContextMenu(e, loc)}
              >
                <div className="archive-index-head">
                  <span className="location-id">{loc.archive_id || '—'}</span>
                  <span className="location-class">
                    {ARCHIVE_CLASS_LABELS[(loc.archive_class as keyof typeof ARCHIVE_CLASS_LABELS) ?? 'structure_site'] ??
                      'Structure Site'}
                  </span>
                </div>
                <span className="location-name">{loc.name || 'Untitled site'}</span>
                <span className="location-meta">
                  {loc.location_text || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`}
                </span>
              </button>
            </li>
          ))}
          {locations.length === 0 && (
            <li className="archive-index-empty">No matching dossiers in index. Adjust filters or survey a new site.</li>
          )}
        </ul>
      </section>

      {contextMenu && (
        <div
          className="archive-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={() => runContextAction(() => onGoTo(contextMenu.location.id))}>
            Locate On Map
          </button>
          <button
            type="button"
            onClick={() => runContextAction(() => onSelect(contextMenu.location.id))}
          >
            Open Dossier
          </button>
          <button
            type="button"
            onClick={() => runContextAction(() => onCopyArchiveId(contextMenu.location.archive_id))}
          >
            Copy Archive ID
          </button>
          <div className="archive-context-divider" />
          <button
            type="button"
            className="danger"
            onClick={() => runContextAction(() => onDeleteIntent(contextMenu.location.id))}
          >
            Delete Dossier
          </button>
        </div>
      )}
    </aside>
  );
}

function FilterSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MediaFile, MediaImportProgress } from '../../shared/types';

interface MediaPanelProps {
  locationId: string;
  variant?: 'site' | 'research';
  heroMediaId?: string | null;
  onSetHeroImage?: (mediaId: string) => void;
  onChange?: () => void;
}

export function MediaPanel({
  locationId,
  variant = 'site',
  heroMediaId,
  onSetHeroImage,
  onChange,
}: MediaPanelProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerImageSrc, setViewerImageSrc] = useState<string | null>(null);
  const [viewerVideoUrl, setViewerVideoUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importProgress, setImportProgress] = useState<MediaImportProgress | null>(null);
  const galleryFiles = useMemo(
    () =>
      files
        .filter((f) => f.type === 'image' || f.type === 'video')
        .filter((f) => variant !== 'site' || getMediaId(f) !== heroMediaId),
    [files, heroMediaId, variant],
  );
  const selected = galleryFiles[selectedIndex] ?? null;

  const releaseImageBindings = useCallback(async () => {
    setViewerOpen(false);
    setViewerImageSrc(null);
    setViewerVideoUrl(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, []);

  const refresh = useCallback(async () => {
    const list = await window.moArchive.media.list(locationId, variant);
    setFiles(list);
    setSelectedIndex(0);
  }, [locationId, variant]);

  const deleteFile = useCallback(
    async (file: MediaFile) => {
      const deletingActive = file.path === selected?.path;
      if (deletingActive) {
        await releaseImageBindings();
      }
      await window.moArchive.media.delete(locationId, file.name, variant);
      if (deletingActive) {
        setSelectedIndex((i) => Math.max(0, Math.min(i, galleryFiles.length - 2)));
      }
      await refresh();
      onChange?.();
    },
    [galleryFiles.length, locationId, onChange, refresh, releaseImageBindings, selected?.path, variant],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return window.moArchive.media.onImportProgress((progress) => {
      if (progress.locationId !== locationId || progress.scope !== variant) return;
      setImportProgress(progress);
      if (progress.stage === 'complete') {
        setTimeout(() => setImportProgress(null), 700);
      }
    });
  }, [locationId, variant]);

  useEffect(() => {
    if (!selected) {
      setViewerImageSrc(null);
      setViewerVideoUrl(null);
      return;
    }
    let cancelled = false;
    if (selected.type === 'image') {
      setViewerVideoUrl(null);
      void window.moArchive.media.dataUrl(selected.path).then((src) => {
        if (!cancelled) setViewerImageSrc(src);
      });
    } else if (selected.type === 'video') {
      setViewerImageSrc(null);
      void window.moArchive.media.fileUrl(selected.path).then((src) => {
        if (!cancelled) setViewerVideoUrl(src);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selected?.path]);

  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewerOpen(false);
      if (e.key === 'ArrowLeft') setSelectedIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setSelectedIndex((i) => Math.min(galleryFiles.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, galleryFiles.length]);

  const addFiles = async (paths: string[]) => {
    if (!paths.length) return;
    setImportProgress({
      locationId,
      scope: variant,
      total: paths.length,
      current: 0,
      stage: 'importing',
    });
    await window.moArchive.media.add(locationId, paths, variant);
    await refresh();
    onChange?.();
    setImportProgress(null);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const paths: string[] = [];
    for (const item of Array.from(e.dataTransfer.files)) {
      const filePath = (item as File & { path?: string }).path;
      if (filePath) paths.push(filePath);
    }
    await addFiles(paths);
  };

  return (
    <section className="media-panel">
      <div className="media-header">
        <span className="field-label">
          {variant === 'site'
            ? `Supporting Evidence (${galleryFiles.length})`
            : `Research Archive (${files.length})`}
        </span>
        <div className="media-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void window.moArchive.media.openFolder(locationId, variant)}
          >
            Open media folder
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              const paths = await window.moArchive.media.pickFiles();
              await addFiles(paths);
            }}
          >
            Attach files
          </button>
        </div>
      </div>

      <div
        className={`media-dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => void onDrop(e)}
      >
        {variant === 'site'
          ? 'Drop supporting evidence here (JPG, PNG, WEBP, MP4, MOV, WEBM)'
          : 'Drop research materials here (PDF, scans, maps)'}
      </div>

      {importProgress && (
        <ImportProgress progress={importProgress} />
      )}

      {variant === 'site' ? (
        <div className="media-gallery">
          <div className="media-gallery-grid">
            {galleryFiles.map((file, index) => (
              <MediaThumbnail
                key={file.path}
                file={file}
                active={index === selectedIndex}
                onSelect={() => {
                  setSelectedIndex(index);
                  requestAnimationFrame(() => setViewerOpen(true));
                }}
                onSetHero={
                  file.type === 'image' && onSetHeroImage
                    ? () => onSetHeroImage(getMediaId(file))
                    : undefined
                }
                onDelete={() => deleteFile(file)}
              />
            ))}
          </div>
          {files.length === 0 && <p className="text-muted">No supporting evidence archived.</p>}
          {files.length > 0 && galleryFiles.length === 0 && (
            <p className="text-muted">Reference imagery assigned. Add supporting evidence to this dossier.</p>
          )}
        </div>
      ) : (
        <div className="research-media-list">
          {files.map((file) => (
            <div key={file.path} className="research-media-row">
              <span className="media-file-label">{file.name}</span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => void deleteFile(file)}
              >
                Remove from dossier
              </button>
            </div>
          ))}
          {files.length === 0 && <p className="text-muted">No research materials archived.</p>}
        </div>
      )}

      {viewerOpen && selected && (viewerImageSrc || viewerVideoUrl) && (
        <div className="media-viewer" onClick={() => setViewerOpen(false)}>
          <div className="media-viewer-toolbar" onClick={(e) => e.stopPropagation()}>
            <span className="media-viewer-label">{selected.name}</span>
            <span className="media-viewer-index">
              {selectedIndex + 1} / {galleryFiles.length}
            </span>
            <button type="button" className="media-viewer-close" onClick={() => setViewerOpen(false)}>
              Close
            </button>
          </div>
          <button
            type="button"
            className="media-viewer-nav left"
            disabled={selectedIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIndex((i) => Math.max(0, i - 1));
            }}
          >
            ‹
          </button>
          <div className="media-viewer-stage" onClick={(e) => e.stopPropagation()}>
            {selected.type === 'video' && viewerVideoUrl ? (
              <div className="media-video-viewer">
                <video src={viewerVideoUrl} controls autoPlay />
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => void window.moArchive.media.openFile(selected.path)}
                >
                  Open in OS Player
                </button>
              </div>
            ) : (
              <img key={selected.path} src={viewerImageSrc ?? ''} alt={selected?.name ?? 'Archive media'} />
            )}
          </div>
          <button
            type="button"
            className="media-viewer-nav right"
            disabled={selectedIndex >= galleryFiles.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIndex((i) => Math.min(galleryFiles.length - 1, i + 1));
            }}
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}

function ImportProgress({ progress }: { progress: MediaImportProgress }) {
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const stageLabel =
    progress.stage === 'thumbnailing'
      ? 'Generating thumbnails…'
      : progress.stage === 'metadata'
        ? 'Reading video metadata…'
        : progress.stage === 'complete'
          ? 'Archive complete.'
          : 'Archiving files…';

  return (
    <div className="media-import-progress">
      <div className="media-import-header">
        <span>Archiving Media…</span>
        <span>
          {progress.current} / {progress.total}
        </span>
      </div>
      <div className="media-progress-track" aria-hidden="true">
        <div className="media-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="media-import-stage">
        <span>{stageLabel}</span>
        {progress.filename && <span className="media-import-file">{progress.filename}</span>}
      </div>
    </div>
  );
}

function MediaThumbnail({
  file,
  active,
  onSelect,
  onSetHero,
  onDelete,
}: {
  file: MediaFile;
  active: boolean;
  onSelect: () => void;
  onSetHero?: () => void;
  onDelete: () => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || src) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const thumbPath = file.thumbnailPath ?? file.path;
        void window.moArchive.media.dataUrl(thumbPath).then(setSrc);
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [file.path, file.thumbnailPath, src]);

  return (
    <div ref={ref} className={`media-thumb ${active ? 'active' : ''}`}>
      <button type="button" className="media-thumb-main" onClick={onSelect}>
        {src ? <img src={src} alt={file.name} loading="lazy" /> : <span className="media-file-label">{file.name}</span>}
        {file.type === 'video' && (
          <span className="media-video-badge">
            <span className="media-video-marker">VID</span>
            {typeof file.durationSeconds === 'number' && (
              <span className="media-duration">{formatDuration(file.durationSeconds)}</span>
            )}
          </span>
        )}
      </button>
      <button
        type="button"
        className="media-delete"
        title="Remove from dossier"
        disabled={deleting}
        onClick={async (e) => {
          e.stopPropagation();
          setDeleting(true);
          setSrc(null);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await onDelete();
        }}
      >
        ×
      </button>
      {onSetHero && (
        <button
          type="button"
          className="media-set-hero"
          onClick={(e) => {
            e.stopPropagation();
            onSetHero();
          }}
        >
          Assign Reference
        </button>
      )}
    </div>
  );
}

function getMediaId(file: MediaFile): string {
  return file.name;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

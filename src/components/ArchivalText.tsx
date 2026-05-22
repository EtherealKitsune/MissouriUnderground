import { splitArchiveReferences } from '../../shared/archive-references';

interface ArchivalTextProps {
  text: string;
  empty?: string;
  className?: string;
  onOpenReference?: (archiveId: string) => void;
}

export function ArchivalText({ text, empty, className, onOpenReference }: ArchivalTextProps) {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) {
    return empty ? <span className="archival-empty">{empty}</span> : null;
  }

  const segments = splitArchiveReferences(trimmed);

  return (
    <span className={['archival-text', className].filter(Boolean).join(' ')}>
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          return <span key={`text-${index}`}>{segment.value}</span>;
        }

        return (
          <button
            key={`ref-${segment.archiveId}-${index}`}
            type="button"
            className="archive-ref-link"
            title={`Open dossier ${segment.archiveId}`}
            onClick={() => onOpenReference?.(segment.archiveId)}
          >
            {segment.display}
          </button>
        );
      })}
    </span>
  );
}

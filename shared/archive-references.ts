/** Bracketed dossier references, e.g. {MO-IND-00021}. Display IDs only — resolve via archive UUID in the database. */
export const ARCHIVE_REFERENCE_PATTERN = /\{([A-Z]{2}-[A-Z0-9]+-\d+)\}/gi;

export type ArchiveReferenceSegment =
  | { kind: 'text'; value: string }
  | { kind: 'reference'; archiveId: string; display: string };

export function normalizeArchiveReferenceId(archiveId: string): string {
  return archiveId.trim().toUpperCase();
}

export function splitArchiveReferences(text: string): ArchiveReferenceSegment[] {
  if (!text) return [];

  const segments: ArchiveReferenceSegment[] = [];
  const pattern = new RegExp(ARCHIVE_REFERENCE_PATTERN.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    }
    const archiveId = normalizeArchiveReferenceId(match[1]);
    segments.push({ kind: 'reference', archiveId, display: `{${archiveId}}` });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

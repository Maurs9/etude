import { MAX_LIBRARY_TRANSFER_BYTES } from './score-library-store.js';
import { isRecord, parseJson } from './storage.js';

const MIB = 1024 * 1024;
const MAX_PROGRESS_IMPORT_BYTES = 16 * MIB;
const COMPLETE_BACKUP_HEADER = '{"app":"etude-backup","version":1,"progress":';
const COMPLETE_BACKUP_LIBRARY = ',"library":';
const MAX_BACKUP_BYTES = MAX_PROGRESS_IMPORT_BYTES + MAX_LIBRARY_TRANSFER_BYTES +
  COMPLETE_BACKUP_HEADER.length + COMPLETE_BACKUP_LIBRARY.length + 1;

export function createBackupFile(progress: string, library?: Blob): Blob {
  return new Blob(library ? [COMPLETE_BACKUP_HEADER, progress, COMPLETE_BACKUP_LIBRARY, library, '}'] : [progress], {
    type: 'application/json',
  });
}

type BackupTransfer =
  | { kind: 'progress'; progress: unknown }
  | { kind: 'library'; library: unknown }
  | { kind: 'complete'; progress: unknown; library: unknown }
  | { kind: 'too-large'; limitMiB: number }
  | { kind: 'too-new' };

function tooLarge(limit: number): BackupTransfer {
  return { kind: 'too-large', limitMiB: Math.floor(limit / MIB) };
}

export async function readBackupFile(file: Blob): Promise<BackupTransfer> {
  if (file.size > MAX_BACKUP_BYTES) return tooLarge(MAX_BACKUP_BYTES);
  if (file.size > MAX_PROGRESS_IMPORT_BYTES) {
    // The built-in exporters put the format marker first. A small read avoids loading oversized legacy files.
    const prefix = (await file.slice(0, 1024).text()).trimStart();
    if (prefix && (!prefix.startsWith('{') || /^\{\s*"v"\s*:/.test(prefix)))
      return tooLarge(MAX_PROGRESS_IMPORT_BYTES);
    if (file.size > MAX_LIBRARY_TRANSFER_BYTES && /^\{\s*"app"\s*:\s*"etude-score-library"/.test(prefix))
      return tooLarge(MAX_LIBRARY_TRANSFER_BYTES);
  }
  const backup = parseJson(await file.text());
  if (isRecord(backup) && backup.app === 'etude-backup') {
    if (typeof backup.version === 'number' && backup.version > 1) return { kind: 'too-new' };
    if (backup.version !== 1 || !isRecord(backup.progress) || !isRecord(backup.library))
      throw new Error('Invalid Étude backup');
    if (new Blob([JSON.stringify(backup.progress)]).size > MAX_PROGRESS_IMPORT_BYTES)
      return tooLarge(MAX_PROGRESS_IMPORT_BYTES);
    if (new Blob([JSON.stringify(backup.library)]).size > MAX_LIBRARY_TRANSFER_BYTES)
      return tooLarge(MAX_LIBRARY_TRANSFER_BYTES);
    return { kind: 'complete', progress: backup.progress, library: backup.library };
  }
  if (isRecord(backup) && backup.app === 'etude-score-library') {
    return file.size > MAX_LIBRARY_TRANSFER_BYTES ? tooLarge(MAX_LIBRARY_TRANSFER_BYTES) : { kind: 'library', library: backup };
  }
  return file.size > MAX_PROGRESS_IMPORT_BYTES ? tooLarge(MAX_PROGRESS_IMPORT_BYTES) : { kind: 'progress', progress: backup };
}

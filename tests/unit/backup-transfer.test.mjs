import { expect, test } from 'vitest';
import { createBackupFile, readBackupFile } from '../../src/domain/backup-transfer.js';

const progress = { v: 3, data: { totalReviews: 7 } };
const library = { app: 'etude-score-library', version: 1, files: [] };

test('a combined file preserves both existing payload formats', async () => {
  const file = createBackupFile(JSON.stringify(progress), new Blob([JSON.stringify(library)]));
  expect(file.type).toBe('application/json');
  expect(await readBackupFile(file)).toEqual({ kind: 'complete', progress, library });
});

test('older progress and score-library files are both recognized', async () => {
  expect(await readBackupFile(createBackupFile(JSON.stringify(progress)))).toEqual({ kind: 'progress', progress });
  expect(await readBackupFile(new Blob([JSON.stringify(library)]))).toEqual({ kind: 'library', library });
});

test('an incomplete combined backup is invalid and a future format is recognized', async () => {
  await expect(readBackupFile(new Blob(['{"app":"etude-backup","version":1,"progress":{}}']))).rejects.toThrow();
  expect(await readBackupFile(new Blob(['{"app":"etude-backup","version":2}']))).toEqual({ kind: 'too-new' });
});

test('a combined file can exceed the legacy progress limit', async () => {
  const paddedLibrary = { ...library, padding: ' '.repeat(16 * 1024 * 1024) };
  const file = createBackupFile(JSON.stringify(progress), new Blob([JSON.stringify(paddedLibrary)]));
  expect((await readBackupFile(file)).kind).toBe('complete');
});

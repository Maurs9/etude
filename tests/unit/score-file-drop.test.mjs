import { expect, test } from 'vitest';
import { readScoreDirectories, scoreFileDrop } from '../../src/infra/score-file-drop.js';

const fileEntry = (name) => ({
  isFile: true,
  name,
  file: (resolve) => resolve(new File(['score'], name)),
});

const directoryEntry = (...batches) => ({
  isDirectory: true,
  createReader: () => {
    const remaining = [...batches];
    return { readEntries: (resolve) => resolve(remaining.shift() ?? []) };
  },
});

test('captures directory entries alongside loose files without passing directories off as files', () => {
  const folder = directoryEntry();
  const looseFile = new File(['score'], 'loose.mid');
  const transfer = {
    items: [
      { kind: 'file', webkitGetAsEntry: () => folder },
      { kind: 'file', getAsFile: () => looseFile },
      { kind: 'string' },
    ],
    files: [new File([], 'folder'), looseFile],
  };
  expect(scoreFileDrop(transfer)).toEqual({ files: [looseFile], directories: [folder] });
  expect(scoreFileDrop({ items: [], files: [looseFile] })).toEqual({ files: [looseFile], directories: [] });
});

test('reads every page of a dropped directory and includes only supported files from subfolders', async () => {
  const folder = directoryEntry(
    [fileEntry('first.MID'), directoryEntry([fileEntry('cover.pdf'), fileEntry('nested.musicxml')])],
    [fileEntry('last.mxl')],
  );
  const selected = await readScoreDirectories([folder]);
  expect(selected.map((file) => file.name)).toEqual(['first.MID', 'nested.musicxml', 'last.mxl']);
});

test('a directory read failure rejects before the caller can save any partial selection', async () => {
  const failure = new Error('Folder disappeared');
  const folder = directoryEntry([fileEntry('found.mid')]);
  const unreadable = { createReader: () => ({ readEntries: (_, reject) => reject(failure) }) };
  await expect(readScoreDirectories([folder, unreadable])).rejects.toThrow(failure);
});

import { isScoreFileName } from '../domain/score-types.js';

/** Capture the files and directory entries while the drop event still exposes them. */
export function scoreFileDrop(transfer: DataTransfer): { files: File[]; directories: FileSystemDirectoryEntry[] } {
  const directories: FileSystemDirectoryEntry[] = [];
  const files: File[] = [];
  for (const item of transfer.items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      directories.push(entry as FileSystemDirectoryEntry);
    } else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return { files: directories.length ? files : Array.from(transfer.files), directories };
}

export async function readScoreDirectories(directories: readonly FileSystemDirectoryEntry[]): Promise<File[]> {
  const files: File[] = [];
  async function readDirectory(directory: FileSystemDirectoryEntry): Promise<void> {
    const reader = directory.createReader();
    while (true) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!entries.length) return;
      for (const entry of entries) {
        if (entry.isDirectory) {
          await readDirectory(entry as FileSystemDirectoryEntry);
        } else if (entry.isFile && isScoreFileName(entry.name)) {
          const fileEntry = entry as FileSystemFileEntry;
          files.push(await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject)));
        }
      }
    }
  }
  for (const directory of directories) await readDirectory(directory);
  return files;
}

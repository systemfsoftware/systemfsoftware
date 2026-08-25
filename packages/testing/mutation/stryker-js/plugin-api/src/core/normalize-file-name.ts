/**
 * Normalizes relative or absolute file names to be in posix format (forward slashes '/')
 */
export function normalizeFileName(fileName: string): string {
  return fileName.replace(/\\/g, '/')
}

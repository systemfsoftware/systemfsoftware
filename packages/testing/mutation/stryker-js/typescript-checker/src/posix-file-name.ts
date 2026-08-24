export function toPosixFileName(fileName: string): string {
  return fileName.replace(/\\/g, '/')
}

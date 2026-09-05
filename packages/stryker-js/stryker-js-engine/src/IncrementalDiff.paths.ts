export const REMEMBERED_REASON = 'Remembered'

const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

export const toRelativeNormalizedFileName = (fileName: string | undefined, basePath: string): string => {
  const raw = fileName ?? ''
  if (raw.startsWith(basePath)) {
    return normalizeFileName(raw.slice(basePath.length).replace(/^\/+/, ''))
  }
  return normalizeFileName(raw)
}

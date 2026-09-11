import * as Match from 'effect/Match'

export const REMEMBERED_REASON = 'Remembered'

const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

export const toRelativeNormalizedFileName = (fileName: string | undefined, basePath: string): string =>
  normalizeFileName(
    Match.value(fileName ?? '').pipe(
      Match.when((raw) => raw.startsWith(basePath), (raw) => raw.slice(basePath.length).replace(/^\/+/, '')),
      Match.orElse((raw) => raw),
    ),
  )

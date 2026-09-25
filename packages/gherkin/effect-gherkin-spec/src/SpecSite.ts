import { Option } from 'effect'

interface SpecFrame {
  readonly file: string
  readonly line: string
  readonly column: string
}

const FRAME = /\(?((?:file:\/\/)?\/[^()\s]+):(\d+):(\d+)\)?$/u
const FILE_URL_PREFIX = /^file:\/\//u
const LAST_SEGMENT = /\/[^/]+$/u

const ownDirectory = import.meta.url.replace(FILE_URL_PREFIX, '').replace(LAST_SEGMENT, '')

const frameOf = (entry: string): Option.Option<SpecFrame> =>
  Option.fromNullishOr(FRAME.exec(entry.trim())).pipe(
    Option.flatMap((match) =>
      Option.all([
        Option.fromNullishOr(match[1]),
        Option.fromNullishOr(match[2]),
        Option.fromNullishOr(match[3]),
      ])
    ),
    Option.map(([file, line, column]) => ({ file, line, column })),
  )

const framesOf = (stack: string): ReadonlyArray<SpecFrame> =>
  stack.split('\n').flatMap((entry) => frameOf(entry).pipe(Option.toArray))

const siteOf = (frame: SpecFrame): string => `${frame.file}:${frame.line}:${frame.column}`

const isOwnFrame = (frame: SpecFrame): boolean => frame.file.startsWith(ownDirectory)

const isInteriorFrame = (frame: SpecFrame): boolean =>
  frame.file.includes('node_modules') || frame.file.includes('node:')

const isSpecFrame = (frame: SpecFrame): boolean => !isOwnFrame(frame) && !isInteriorFrame(frame)

export const specSite = (): string | undefined =>
  Option.fromNullishOr(framesOf(new Error().stack ?? '').filter(isSpecFrame)[0]).pipe(
    Option.map(siteOf),
    Option.getOrUndefined,
  )

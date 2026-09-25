/**
 * The one rule that reads a frame out of a stack: which frame a failure is raised from, and which frame an author
 * wrote the thing that raised it on (R2, KTD6).
 *
 * A deferred check and a declared property both fail inside the fork, where the stack holds only the fork's frames
 * and the author's line is long gone. Each captures its call site while the author's frame is still on the stack
 * and hands it to the failure as its first frame, so the renderer's R2 walk leads with the author's line.
 *
 * The rule is the same everywhere it applies: the first frame outside the vendored install, node internals, and
 * every spec library's own `src` and `dist` — {@link LIBRARY_DIRS}. A caller may name its own extra frames with a
 * {@link RegExp}, and a value that captured a raw stack records it whole, resolved here rather than by a second
 * copy of the rule. `effect-spec-runtime`, `effect-cell-types`, `effect-gherkin-spec` and `trace-spec` read it from
 * here.
 *
 * @since 4.0.0
 */
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'

const FRAME = /\(?((?:file:\/\/)?[^()\s]+):(\d+):(\d+)\)?\s*$/u
const FILE_PROTOCOL = 'file://'
const FRAME_AT = 'at '
const FRAME_PAREN = ' ('

const and = (left: boolean, right: boolean): boolean => left && right
const not = (value: boolean): boolean => !value

const LIBRARY_DIRS: ReadonlyArray<string> = [
  'runner/vitest',
  'effect-spec-runtime',
  'effect-cell-types',
  'effect-gherkin-spec',
  'storybook-gherkin',
  'conformance-spec',
  'differential-spec',
  'trace-spec',
  'effect-daemon-spec',
]

const isVendoredPath = (path: string): boolean => path.includes('node_modules') || path.startsWith('node:')

const inOwnDir = (path: string) => (dir: string): boolean =>
  path.includes(`/${dir}/src/`) || path.includes(`/${dir}/dist/`)

const isLibraryPath = (path: string): boolean => LIBRARY_DIRS.some(inOwnDir(path))

/** @internal */
export const isUserPath = (path: string): boolean => and(not(isVendoredPath(path)), not(isLibraryPath(path)))

/** @internal */
export interface StackFrame {
  readonly path: string
  readonly line: string
  readonly column: string
  readonly fn: string | undefined
  readonly raw: string
}

interface FrameParts {
  readonly path: string
  readonly line: string
  readonly column: string
}

const stripProtocol = (path: string): string => path.startsWith(FILE_PROTOCOL) ? path.slice(FILE_PROTOCOL.length) : path

const isFrame = (frame: StackFrame | undefined): frame is StackFrame => frame !== undefined

const partsOf = (match: RegExpExecArray | null): Option.Option<FrameParts> =>
  Option.flatMap(Option.fromNullishOr(match), (found) =>
    Option.map(
      Option.all([
        Option.fromNullishOr(found[1]),
        Option.fromNullishOr(found[2]),
        Option.fromNullishOr(found[3]),
      ]),
      ([path, line, column]) => ({ path: stripProtocol(path), line, column }),
    ))

const beforeParen = (rest: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(rest.indexOf(FRAME_PAREN)), (paren) => Option.some(rest.slice(0, paren)))

const afterAt = (line: string): Option.Option<string> =>
  line.startsWith(FRAME_AT) ? Option.some(line.slice(FRAME_AT.length)) : Option.none()

const nonEmpty = (text: string): boolean => text.length > 0

const fnIn = (line: string): string | undefined =>
  Option.getOrUndefined(
    Option.flatMap(afterAt(line), (rest) => Option.filter(beforeParen(rest), nonEmpty)),
  )

const frameOfLine = (line: string): StackFrame | undefined => {
  const raw = line.trim()
  return Option.match(partsOf(FRAME.exec(raw)), {
    onNone: () => undefined,
    onSome: (parts) => ({ ...parts, fn: fnIn(raw), raw }),
  })
}

/** @internal */
export const framesOf = (stack: string): ReadonlyArray<StackFrame> => stack.split('\n').map(frameOfLine).filter(isFrame)

const frameSiteOf = (frame: StackFrame): string => `${frame.path}:${frame.line}:${frame.column}`

const isUserFrame = (frame: StackFrame): boolean => isUserPath(frame.path)

const firstUserFrameOf = (stack: string): StackFrame | undefined => framesOf(stack).find(isUserFrame)

/** @internal */
export const firstUserSiteOf = (stack: string): string | undefined => {
  const frame = firstUserFrameOf(stack)
  return frame === undefined ? undefined : frameSiteOf(frame)
}

const NO_LIBRARY = /$^/u
const currentStack = (): string => new Error().stack ?? ''

const isSiteOf = (library: RegExp) => (frame: StackFrame): boolean =>
  and(isUserPath(frame.path), not(library.test(frame.raw)))

const firstFrameOf = (stack: string, library: RegExp): StackFrame | undefined => framesOf(stack).find(isSiteOf(library))

/** @internal */
export const callFrameOutside = (library: RegExp): string | undefined => {
  const frame = firstFrameOf(currentStack(), library)
  return frame === undefined ? undefined : frame.raw
}

/** @internal */
export const callFrame = (): string | undefined => callFrameOutside(NO_LIBRARY)

const callSiteOutside = (library: RegExp): string | undefined => {
  const frame = firstFrameOf(currentStack(), library)
  return frame === undefined ? undefined : frameSiteOf(frame)
}

/** @internal */
export const callSite = (): string | undefined => callSiteOutside(NO_LIBRARY)

const firstLineOf = (lines: ReadonlyArray<string>): string => lines[0] ?? ''

const stackOf = (error: Error): string => error.stack ?? ''

const withRaisingFrameImpl = <A extends Error>(error: A, frame: string | undefined): A => {
  if (frame === undefined) return error
  const lines = stackOf(error).split('\n')
  error.stack = [firstLineOf(lines), frame, ...lines.slice(1)].join('\n')
  return error
}

/** @internal */
export const withRaisingFrame: {
  <A extends Error>(error: A, frame: string | undefined): A
  (frame: string | undefined): <A extends Error>(error: A) => A
} = Function.dual(2, withRaisingFrameImpl)

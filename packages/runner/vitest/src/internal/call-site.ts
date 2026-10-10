/**
 * The one rule that reads a frame out of a stack: which frame a failure is raised from, and which frame an author
 * wrote the thing that raised it on (R2, KTD6).
 *
 * A deferred check and a declared property both fail inside the fork, where the stack holds only the fork's frames
 * and the author's line is long gone. Each captures its call site while the author's frame is still on the stack
 * and hands it to the failure as its first frame, so the renderer's R2 walk leads with the author's line.
 *
 * The rule is the same everywhere it applies: the first frame outside the vendored install, node internals, and
 * every spec library's own `src` and `dist`. A caller may name its own extra frames with a {@link RegExp}, and a
 * value that captured a raw stack records it whole, resolved here rather than by a second copy of the rule.
 * `effect-spec-runtime`, `effect-cell-types`, `effect-gherkin-spec` and `trace-spec` read it from here.
 *
 * A library frame is owned by its library's package directory, never by a match on its absolute path: each entry in
 * {@link LIBRARY_DIRS} is that directory relative to the workspace's `packages/` root, so a frame's own position
 * below that root is compared against the entries directly. A frame lies in a library's own tree when it sits under
 * that directory's `src` or `dist` — including a Stryker sandbox's copy, which relocates the tree one
 * `.stryker-tmp/<sandbox>` directory below the directory.
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

const PATH_SEPARATOR = '/'
const SANDBOX_TMP = '.stryker-tmp'

/** The spec libraries' package directories, relative to the workspace's `packages/` root. */
const LIBRARY_DIRS: ReadonlyArray<string> = [
  'runner/vitest',
  'effect-spec-runtime',
  'effect-cell-types',
  'gherkin/effect-gherkin-spec',
  'gherkin/storybook-gherkin',
  'sim/conformance-spec',
  'sim/differential-spec',
  'trace/trace-spec',
  'daemon/effect-daemon-spec',
]

type FrameOwner = 'vendored' | 'library' | 'user'

const isVendoredPath = (path: string): boolean => path.includes('node_modules') || path.startsWith('node:')

const sourceSegmentOf = (rest: string): string | undefined => {
  const segments = rest.split(PATH_SEPARATOR)
  return segments[0] === SANDBOX_TMP ? segments[2] : segments[0]
}

const isSourceDir = (segment: string | undefined): boolean => segment === 'src' || segment === 'dist'

const isSourceTreeWithin = (rest: string): boolean => isSourceDir(sourceSegmentOf(rest))

const WORKSPACE_MARKER = `${PATH_SEPARATOR}packages${PATH_SEPARATOR}`

/** A path's position in the workspace: everything after its `packages/` root, or the whole path. */
const workspaceTailOf = (path: string): string => {
  const at = path.lastIndexOf(WORKSPACE_MARKER)
  return at === -1 ? path : path.slice(at + WORKSPACE_MARKER.length)
}

const restBelow = (tail: string, pathTail: string): string | undefined => {
  const marker = `${tail}${PATH_SEPARATOR}`
  return pathTail.startsWith(marker) ? pathTail.slice(marker.length) : undefined
}

const isSourceBelow = (rest: string | undefined): boolean => rest !== undefined && isSourceTreeWithin(rest)

const isLibraryPath = (path: string): boolean => {
  const pathTail = workspaceTailOf(path)
  return LIBRARY_DIRS.some((dir) => isSourceBelow(restBelow(dir, pathTail)))
}

const ownerOfPath = (path: string): FrameOwner => isLibraryPath(path) ? 'library' : 'user'

/**
 * The owner of a frame's path, a pure function of the known library directories and the path. A directory owns a
 * frame by the frame's position in the same workspace, so a relocated tree — a Stryker sandbox copy — still
 * resolves.
 *
 * @internal
 */
export const frameOwner = (path: string): FrameOwner => isVendoredPath(path) ? 'vendored' : ownerOfPath(path)

const isUserPath = (path: string): boolean => frameOwner(path) === 'user'

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

/** @internal */
export const siteOfFrame = (frame: StackFrame): string => `${frame.path}:${frame.line}:${frame.column}`

/** @internal */
export const isUserFrame = (frame: StackFrame): boolean => isUserPath(frame.path)

const NO_LIBRARY = /$^/u
const currentStack = (): string => new Error().stack ?? ''

const isSiteOf = (library: RegExp) => (frame: StackFrame): boolean =>
  and(isUserFrame(frame), not(library.test(frame.raw)))

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
  return frame === undefined ? undefined : siteOfFrame(frame)
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

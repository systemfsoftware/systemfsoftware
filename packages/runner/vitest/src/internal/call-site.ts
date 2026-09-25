/**
 * Where a failure is raised from when the fork is the thing that raised it (R2, KTD6).
 *
 * A deferred check and a declared property both fail inside the fork: by then the stack holds only the fork's frames,
 * and the line that wrote the check is long gone. Each captures its own call site while the author's frame is still
 * on the stack — `expect(...)` at the call, `it.prop(...)` at the declaration — and hands it to the failure as its
 * first frame, so the renderer's R2 walk leads with the author's line instead of refusing the record for naming none.
 *
 * The rule is the one `effect-gherkin-spec`'s `specSite` and `effect-cell-types`' `callSite` apply to their own
 * frames: the first frame outside the vendored install, node internals, and the fork's own `src` and `dist`.
 *
 * @since 4.0.0
 */
import * as Function from 'effect/Function'

/** A frame's location at the end of a stack line, with the `file://` prefix a Node stack may carry. */
const FRAME = /\(?((?:file:\/\/)?\/[^()\s]+):(\d+):(\d+)\)?\s*$/u

/** The frames that are never a site: the vendored install, node internals, and the fork's own `src` and `dist`. */
const INTERIOR = /node_modules|node:|\/runner\/vitest\/(?:src|dist)\//

const isInterior = (line: string): boolean => INTERIOR.test(line)

const and = (left: boolean, right: boolean): boolean => left && right

const isFrame = (line: string): boolean => and(FRAME.test(line), isInterior(line) === false)

const firstFrameOf = (stack: string): string | undefined => stack.split('\n').slice(1).find(isFrame)?.trim()

/**
 * The first frame of this call's stack outside {@link INTERIOR}, as the line it appears on — the author's line while
 * the author's frame is on the stack.
 *
 * @internal
 */
export const callFrame = (): string | undefined => firstFrameOf(`${new Error().stack ?? ''}`)

const firstLineOf = (lines: ReadonlyArray<string>): string => lines[0] ?? ''

const stackOf = (error: Error): string => error.stack ?? ''

const withRaisingFrameImpl = <A extends Error>(error: A, frame: string | undefined): A => {
  if (frame === undefined) return error
  const lines = stackOf(error).split('\n')
  error.stack = [firstLineOf(lines), frame, ...lines.slice(1)].join('\n')
  return error
}

/**
 * `error` with `frame` as its first stack frame, so the renderer's R2 walk finds the author's line before any of the
 * fork's own frames. Without a frame the error is handed back untouched.
 *
 * @internal
 */
export const withRaisingFrame: {
  <A extends Error>(error: A, frame: string | undefined): A
  (frame: string | undefined): <A extends Error>(error: A) => A
} = Function.dual(2, withRaisingFrameImpl)

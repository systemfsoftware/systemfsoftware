/**
 * Pure line reassembly for demuxed log streams (behavioral reference:
 * upstream rightsize-node `src/backend-docker/frames.ts` `LineAssembler` at
 * the fork point, Apache-2.0).
 *
 * A single log line can straddle two (or more) demuxed frames with no
 * relationship to where the actual `\n` falls; this kernel buffers a
 * trailing partial line across `feed` calls and returns only the lines a
 * call completes. `flush` hands back that trailing fragment once at stream
 * end — idempotent, since a terminal stream event can legitimately fire more
 * than once for the same close.
 *
 * A genuinely-empty interior line (a blank line the workload printed) is
 * real output and must be delivered — only the trailing "nothing pending"
 * marker is ever dropped. Both backends agree on blank lines.
 *
 * Pure and total: the input state is never mutated; every call returns the
 * next state alongside its outputs.
 *
 * @since 0.1.0
 */

/** Immutable assembler state: the pending partial line and whether `flush` already fired. */
export interface LineAssembler {
  /** The unterminated tail of a line across calls; `''` when nothing is buffered. */
  readonly pending: string
  /** `true` once `flush` has delivered its one trailing fragment. */
  readonly flushed: boolean
}

/** A fresh assembler. */
export const createLineAssembler = (): LineAssembler => ({ pending: '', flushed: false })

/**
 * Feeds one text chunk and returns the newly-completed lines, in order.
 * Interior blank lines are real output and are included; only the trailing
 * "nothing pending" marker is dropped.
 */
export const feedLines = (assembler: LineAssembler, text: string): readonly [LineAssembler, readonly string[]] => {
  const pending = assembler.pending + text
  if (!pending.includes('\n')) {
    return [{ ...assembler, pending }, []]
  }
  const endsWithNewline = pending.endsWith('\n')
  const parts = pending.split('\n')
  // split("a\nb\n", "\n") => ["a","b",""] — the trailing "" is the
  // "nothing pending" marker when the chunk ended exactly on a newline;
  // split("a\nb", "\n") => ["a","b"], where "b" is genuinely pending.
  // Either way the last element is never a completed line.
  const tail = parts.pop() ?? ''
  return [{ ...assembler, pending: endsWithNewline ? '' : tail, flushed: assembler.flushed }, parts]
}

/**
 * Hands back the trailing unterminated fragment exactly once, or `undefined`
 * when there was none (or this was already called).
 */
export const flushLines = (assembler: LineAssembler): readonly [LineAssembler, string | undefined] => {
  if (assembler.flushed || assembler.pending.length === 0) {
    return [{ ...assembler, flushed: true }, undefined]
  }
  const tail = assembler.pending
  return [{ ...assembler, pending: '', flushed: true }, tail]
}

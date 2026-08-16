/**
 * Workflow cell — the pure decision for leaf AGENTS.md delivery.
 *
 * Data in, `Either` out, no I/O. Ported from the deleted
 * `.claude/hooks/deliver-leaf-agents-md.ts` governing-leaf walk, split along
 * the I/O boundary: the executor probes the filesystem and hands the ordered
 * list of existing candidate leaves here; `governingLeaf` picks the first
 * (deepest) one, and `decide` applies the dedupe (once per leaf per session)
 * and the injection verdict.
 *
 * The wrapper text is also pure: an inline block for leaves at or under the
 * size threshold, a pointer for outliers. The error channel is
 * `S.TaggedError`; decision variants are `S.TaggedClass` (Workflow Gates,
 * `omp/AGENTS.md`).
 */
import { Result, Schema as S } from 'effect'
import { dirname } from 'node:path/posix'

export class LeafContextError extends S.TaggedError<LeafContextError>()('LeafContextError', {
  detail: S.String,
}) {}

export class Inject extends S.TaggedClass<Inject>()('Inject', {
  leaf: S.String,
  content: S.String,
}) {}

export class Skip extends S.TaggedClass<Skip>()('Skip', {}) {}

/** Inline the leaf up to this many bytes; larger leaves become a pointer. */
export const INLINE_THRESHOLD = 6144

/** Deepest existing candidate in walk order — the governing leaf (first wins). */
export const governingLeaf = (existingLeaves: readonly string[]): string | null => existingLeaves[0] ?? null

export interface DecideArgs {
  readonly relTarget: string | null
  readonly leaf: string | null
  readonly content: string
  readonly injected: ReadonlySet<string>
}

export const decide = (args: DecideArgs): Result.Result<Inject | Skip, LeafContextError> => {
  if (args.relTarget === null || args.leaf === null || args.injected.has(args.leaf)) {
    return Result.succeed(new Skip())
  }
  return Result.succeed(new Inject({ leaf: args.leaf, content: args.content }))
}

export const leafBlock = (leaf: string, content: string): string => {
  const bytes = new TextEncoder().encode(content).length
  if (bytes > INLINE_THRESHOLD) {
    return (
      `\n\n<leaf-agents-md path="${leaf}" pointer="true">` +
      `Leaf governance not inlined (over ${
        Math.round(INLINE_THRESHOLD / 1024)
      } KiB) — read ${leaf} before further changes under ${dirname(leaf)}/.</leaf-agents-md>`
    )
  }
  return `\n\n<leaf-agents-md path="${leaf}">\n${content}\n</leaf-agents-md>`
}

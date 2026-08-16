/**
 * Workflow cell — the pure decision for leaf AGENTS.md delivery.
 *
 * Data in, decision out, no I/O. Ported from the deleted
 * `.claude/hooks/deliver-leaf-agents-md.ts` governing-leaf walk, split along
 * the I/O boundary: the executor probes the filesystem, `governingLeaf` picks
 * the deepest existing candidate, and `decide` — the single source of the
 * dedupe and self-injection predicates — returns `Select` (inject this leaf)
 * or `Skip`. The executor reads the leaf's content only after a `Select`, so
 * a repeat touch never re-reads the file it already delivered.
 *
 * The wrapper text is also pure: an inline block for leaves at or under the
 * size threshold (measured in UTF-8 bytes), a pointer for outliers. Decision
 * variants are `S.TaggedClass` (Workflow Gates, `omp/AGENTS.md`); the error
 * channel belongs to the executor, which materializes `Inject` content.
 */
import { Schema as S } from 'effect'
import { dirname } from 'node:path/posix'

export class LeafContextError extends S.TaggedError<LeafContextError>()('LeafContextError', {
  detail: S.String,
}) {}

export class Inject extends S.TaggedClass<Inject>()('Inject', {
  leaf: S.String,
  content: S.String,
}) {}

export class Skip extends S.TaggedClass<Skip>()('Skip', {}) {}

/** Leaf selected for delivery by `decide`; content is materialized by the executor. */
export class Select extends S.TaggedClass<Select>()('Select', {
  leaf: S.String,
}) {}

/** Inline the leaf up to this many bytes; larger leaves become a pointer. */
export const INLINE_THRESHOLD = 6144

/** Deepest existing candidate in walk order — the governing leaf (first wins). */
export const governingLeaf = (existingLeaves: readonly string[]): string | null => existingLeaves[0] ?? null

export interface DecideArgs {
  /** The touched target, root-relative; the executor guarantees non-null here. */
  readonly relTarget: string
  /** Governing leaf (root-relative AGENTS.md path), or null when none exists. */
  readonly leaf: string | null
  /** Leaves already delivered in this session. */
  readonly injected: ReadonlySet<string>
}

export const decide = (args: DecideArgs): Select | Skip => {
  if (args.leaf === null || args.relTarget === args.leaf || args.injected.has(args.leaf)) {
    return new Skip()
  }
  return new Select({ leaf: args.leaf })
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

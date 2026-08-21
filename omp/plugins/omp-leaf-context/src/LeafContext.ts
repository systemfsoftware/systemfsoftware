/**
 * LeafContext — the delivery workflow, pure.
 *
 * The surviving cell: the eligibility decision, expressed as a
 * `Workflow.make` value from `@systemfsoftware/effect-cell-types`. The make
 * body is a single exhaustive dispatch over a closed classification (the
 * repo's one-path workflow idiom, mirrored in the hook-verdict workflow);
 * the branching lives in the pure `classify` helper, which maps the typed
 * command to one of the closed `Classified` arms the body dispatches on.
 *
 * The error channel is `LeafContextError`, a real invariant violation: when
 * the shell's walk hands back a governing leaf that is not a safe root-relative
 * `AGENTS.md` path (absolute, ascending, outside `repos/`, or mis-suffixed),
 * the decision refuses it rather than injecting on an unchecked path. The
 * normal closures — no governing leaf, the touched file is the leaf itself,
 * the leaf already delivered this session — are `Skip`.
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

/** Inline the leaf up to this many UTF-8 bytes; larger leaves become a pointer. */
export const INLINE_THRESHOLD = 6144

export class LeafContextError extends S.TaggedError<LeafContextError>()('LeafContextError', {
  kind: S.Literal('invalid-leaf-path'),
  leaf: S.String,
}) {}

export class Skip extends S.TaggedClass<Skip>()('Skip', {}) {}

/** Leaf selected for delivery; content is read by the shell, never here. */
export class Select extends S.TaggedClass<Select>()('Select', {
  leaf: S.String,
}) {}

export type Decision = Select | Skip

export interface LeafContextCommand {
  /** The touched target, root-relative. The shell guarantees non-null. */
  readonly relTarget: string
  /** Governing leaf (root-relative `AGENTS.md` path), or null when none exists. */
  readonly governingLeaf: string | null
  /** Leaves already delivered in this session. */
  readonly injected: ReadonlySet<string>
}

/** Deepest existing candidate in walk order — the governing leaf (first wins). */
export const governingLeaf = (existingLeaves: readonly string[]): string | null => existingLeaves[0] ?? null

/** An unsafe governing-leaf path is refused: absolute, ascending, or not a leaf name. */
const isInvalidLeafPath = (leaf: string): boolean => {
  if (leaf.startsWith('/')) return true
  if (leaf.split('/').includes('..')) return true
  if (leaf.startsWith('repos/')) return true
  return !leaf.endsWith('/AGENTS.md')
}

export type Classified =
  | { readonly _tag: 'NoLeaf' }
  | { readonly _tag: 'InvalidLeafPath'; readonly leaf: string }
  | { readonly _tag: 'SelfTouch' }
  | { readonly _tag: 'Used' }
  | { readonly _tag: 'Ready'; readonly leaf: string }

/** The closed classification the make body dispatches on. */
export const classify = (command: LeafContextCommand): Classified => {
  const { governingLeaf, relTarget, injected } = command
  if (governingLeaf === null) return { _tag: 'NoLeaf' }
  if (isInvalidLeafPath(governingLeaf)) return { _tag: 'InvalidLeafPath', leaf: governingLeaf }
  if (relTarget === governingLeaf) return { _tag: 'SelfTouch' }
  if (injected.has(governingLeaf)) return { _tag: 'Used' }
  return { _tag: 'Ready', leaf: governingLeaf }
}

/**
 * The delivery decision, built with the cell library's `Workflow.make`: one
 * exhaustive dispatch over `classify`'s closed arms, `Select` from a `Ready`
 * leaf, `Skip` from the normal closures, `LeafContextError` from an invalid
 * leaf path.
 */
export const decide = Workflow.make(
  (command: LeafContextCommand): Result.Result<Decision, LeafContextError> =>
    Match.value(classify(command)).pipe(
      Match.tag('NoLeaf', () => Result.succeed(new Skip())),
      Match.tag('SelfTouch', () => Result.succeed(new Skip())),
      Match.tag('Used', () => Result.succeed(new Skip())),
      Match.tag(
        'InvalidLeafPath',
        ({ leaf }) => Result.fail(new LeafContextError({ kind: 'invalid-leaf-path', leaf })),
      ),
      Match.tag('Ready', ({ leaf }) => Result.succeed(new Select({ leaf }))),
      Match.exhaustive,
    ),
)

/** The wrapper text: inline for leaves at or under the threshold, a pointer for outliers. */
export const leafBlock = (leaf: string, content: string): string => {
  const bytes = new TextEncoder().encode(content).length
  if (bytes > INLINE_THRESHOLD) {
    return (
      `\n\n<leaf-agents-md path="${leaf}" pointer="true">` +
      `Leaf governance not inlined (over ${
        Math.round(INLINE_THRESHOLD / 1024)
      } KiB) — read ${leaf} before further changes under ${leaf.split('/').slice(0, -1).join('/')}/.</leaf-agents-md>`
    )
  }
  return `\n\n<leaf-agents-md path="${leaf}">\n${content}\n</leaf-agents-md>`
}

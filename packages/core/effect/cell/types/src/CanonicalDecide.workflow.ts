import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import * as Workflow from './Workflow.js'

/**
 * The canonical command. `Workflow.make` constrains its first argument to a real
 * schema class, so the canonical description needs one too — it carries no fields
 * because the canonical's phases do nothing, and its only job is to be a genuine
 * command value rather than a shape asserted into place.
 *
 * It is declared here rather than in a `*.schema.ts` because this is the owning
 * single-segment `<stem>.workflow.ts`, which `schema-declaration-location` admits.
 */
export class CanonicalCommand extends S.TaggedClass<CanonicalCommand>()('CanonicalCommand', {}) {}

/**
 * The canonical decider. Extracted so `make-file-location` only sees it inside a
 * single-segment `.workflow.ts` file, satisfying the restored taxonomy while
 * preserving the exact phantom-channel contract the `DecidePhase` brand and
 * the interpreter rely on.
 */
export const canonicalDecide = Workflow.make(
  CanonicalCommand,
  (_command: CanonicalCommand): Result.Result<undefined, Workflow.Tagged> => Result.succeed(undefined),
)

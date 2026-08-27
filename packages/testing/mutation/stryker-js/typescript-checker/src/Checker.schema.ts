/**
 * Checker — declarations for the TypeScript checker.
 *
 * Houses the wire types and error variants shared by the capability and its
 * workflow. Decoded at the checker boundary; no I/O.
 */
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as S from 'effect/Schema'

// ── command ────────────────────────────────────────────────────────────────

export class CheckMutantsCommand extends S.TaggedClass<CheckMutantsCommand>()(
  'CheckMutantsCommand',
  {
    mutants: S.Array(Mutant),
  },
) {}

// ── compiler errors ──────────────────────────────────────────────────────

/**
 * Every way the TypeScript compiler can fail while serving a check.
 * One tagged error — callers branch only on failure itself; `reason` keeps
 * cases distinguishable in reports.
 */
export class CompilerFailed extends S.TaggedError<CompilerFailed>()('CompilerFailed', {
  reason: S.Literals(['not-initialized', 'no-projects', 'unknown-file-node', 'file-not-in-project']),
  subject: S.optional(S.String),
}) {
  override get message(): string {
    switch (this.reason) {
      case 'not-initialized':
        return 'The TypeScript compiler was used before it was initialized'
      case 'no-projects':
        return `No projects were found for ${this.subject ?? 'the tsconfig'}`
      case 'unknown-file-node':
        return `The file graph has no node for '${this.subject ?? 'a file'}', which should not happen`
      case 'file-not-in-project':
        return `'${this.subject ?? 'a file'}' is part of your TypeScript project but could not be found on disk`
    }
  }
}

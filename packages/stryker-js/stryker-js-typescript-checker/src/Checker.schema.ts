/**
 * Checker — declarations for the TypeScript checker.
 *
 * Houses the wire types and error variants shared by the capability and its
 * workflow. Decoded at the checker boundary; no I/O.
 */
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

import { MutantCodec } from './Mutant.schema.js'

export const TypescriptCheckerOptionsSchema = S.Struct({
  typescriptChecker: S.optional(
    S.Struct({
      prioritizePerformanceOverAccuracy: S.optional(S.Boolean),
    }),
  ),
})

// ── command ────────────────────────────────────────────────────────────────

export class CheckMutantsCommand extends S.TaggedClass<CheckMutantsCommand>()(
  'CheckMutantsCommand',
  {
    mutants: S.Array(MutantCodec),
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
    return Match.value(this.reason).pipe(
      Match.when('not-initialized', () => 'The TypeScript compiler was used before it was initialized'),
      Match.when('no-projects', () => `No projects were found for ${this.subject ?? 'the tsconfig'}`),
      Match.when(
        'unknown-file-node',
        () => `The file graph has no node for '${this.subject ?? 'a file'}', which should not happen`,
      ),
      Match.when(
        'file-not-in-project',
        () => `'${this.subject ?? 'a file'}' is part of your TypeScript project but could not be found on disk`,
      ),
      Match.exhaustive,
    )
  }
}

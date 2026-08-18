import { Schema as S } from 'effect'

/**
 * The hook run's raw wire: what the child process returned and what the run
 * outcome claims. The verdict a run produces (`Block`/`Allow`/`Warning`,
 * `HookDecision`) belongs to the verdict decision and lives beside it in
 * `HookVerdict.workflow.ts` — the reader imports the workflow.
 */

export const HookResult = S.Struct({ code: S.Number, stdout: S.String, stderr: S.String })
export type HookResult = S.Schema.Type<typeof HookResult>

export class Blocked extends S.TaggedClass<Blocked>()('Blocked', { reason: S.String }) {}

export class Continue extends S.TaggedClass<Continue>()(
  'Continue',
  { warning: S.optional(S.String), updatedInput: S.optional(S.Record(S.String, S.Unknown)) },
) {}

export const HookOutcome = S.Union([Blocked, Continue])
export type HookOutcome = S.Schema.Type<typeof HookOutcome>
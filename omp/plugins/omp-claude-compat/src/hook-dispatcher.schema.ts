import { Schema as S } from 'effect'

export const HookResult = S.Struct({ code: S.Number, stdout: S.String, stderr: S.String })
export type HookResult = S.Schema.Type<typeof HookResult>

export class Block extends S.TaggedClass<Block>()('Block', { reason: S.String }) {}

export class Allow extends S.TaggedClass<Allow>()(
  'Allow',
  { updatedInput: S.optional(S.Record({ key: S.String, value: S.Unknown })) },
) {}

export class Warning extends S.TaggedClass<Warning>()('Warning', { message: S.String }) {}

export const HookDecision = S.Union(Block, Allow, Warning)
export type HookDecision = S.Schema.Type<typeof HookDecision>

export class Blocked extends S.TaggedClass<Blocked>()('Blocked', { reason: S.String }) {}

export class Continue extends S.TaggedClass<Continue>()(
  'Continue',
  { warning: S.optional(S.String), updatedInput: S.optional(S.Record({ key: S.String, value: S.Unknown })) },
) {}

export const HookOutcome = S.Union(Blocked, Continue)
export type HookOutcome = S.Schema.Type<typeof HookOutcome>

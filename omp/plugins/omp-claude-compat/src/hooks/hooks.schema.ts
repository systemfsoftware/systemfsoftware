import type { InputEvent } from '@oh-my-pi/pi-coding-agent'
import { Effect, Schema as S, SchemaGetter } from 'effect'

export const ParsedHookOutputSchema = S.Struct({
  decision: S.optional(S.String),
  reason: S.optional(S.String),
  hookSpecificOutput: S.optional(
    S.Struct({
      permissionDecision: S.optional(S.String),
      permissionDecisionReason: S.optional(S.String),
      updatedInput: S.optional(S.Record(S.String, S.Unknown)),
      additionalContext: S.optional(S.String),
    }),
  ),
}).pipe(
  S.annotate({
    toArbitrary: () => (fc) =>
      fc.record({
        decision: fc.string(),
        reason: fc.string(),
        hookSpecificOutput: fc.record({
          permissionDecision: fc.string(),
          permissionDecisionReason: fc.string(),
          updatedInput: fc.dictionary(fc.string(), fc.jsonValue()),
          additionalContext: fc.string(),
        }),
      }),
  }),
)
export type ParsedHookOutput = S.Schema.Type<typeof ParsedHookOutputSchema>

export const HookOutputFromStdout = S.String.pipe(
  S.decodeTo(S.toType(ParsedHookOutputSchema), {
    decode: SchemaGetter.transformOrFail((stdout) =>
      S.decodeUnknownEffect(S.fromJsonString(S.toType(ParsedHookOutputSchema)))(stdout).pipe(
        Effect.mapError((err) => (S.isSchemaError(err) ? err.issue : err)),
      )
    ),
    encode: SchemaGetter.transformOrFail((parsed) => Effect.succeed(JSON.stringify(parsed as unknown))),
  }),
)

export const HookResult = S.Struct({ code: S.Number, stdout: S.String, stderr: S.String })
export type HookResult = S.Schema.Type<typeof HookResult>

export class Blocked extends S.TaggedClass<Blocked>()('Blocked', { reason: S.String }) {}

export class Continue extends S.TaggedClass<Continue>()(
  'Continue',
  { warning: S.optional(S.String), updatedInput: S.optional(S.Record(S.String, S.Unknown)) },
) {}

export const HookOutcome = S.Union([Blocked, Continue])
export type HookOutcome = S.Schema.Type<typeof HookOutcome>

export class AdmitHooksCommand extends S.TaggedClass<AdmitHooksCommand>()('AdmitHooksCommand', {
  present: S.Boolean,
}) {}

const HookDispatchDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-claude-compat/HookDispatchDecision',
)
type HookDispatchDecisionTypeId = typeof HookDispatchDecisionTypeId

export class SkipHooks extends S.TaggedClass<SkipHooks>()('SkipHooks', {}) {
  readonly [HookDispatchDecisionTypeId] = HookDispatchDecisionTypeId
}

export class RunHooks extends S.TaggedClass<RunHooks>()('RunHooks', {}) {
  readonly [HookDispatchDecisionTypeId] = HookDispatchDecisionTypeId
}

export type AdmitCommand = InstanceType<typeof AdmitHooksCommand>
export type HookDispatchDecision = InstanceType<typeof SkipHooks> | InstanceType<typeof RunHooks>

export interface HookSession {
  readonly cwd: string
  readonly homeDir: string
  readonly sessionManager: { readonly getSessionId: () => string }
  readonly ui: { readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void }
}

export interface HookToolCall {
  readonly toolName: string
  readonly toolCallId: string

  readonly input: object
}

export interface HookToolResult extends HookToolCall {
  readonly content: unknown
  readonly isError?: boolean | undefined
}

export interface HookPrompt {
  readonly text: string
  readonly source: InputEvent['source']
  readonly images?: InputEvent['images']
}

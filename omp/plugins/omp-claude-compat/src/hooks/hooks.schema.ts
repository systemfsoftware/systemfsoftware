import type { InputEvent } from '@oh-my-pi/pi-coding-agent'
import { Effect, Schema as S, SchemaGetter } from 'effect'

export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | JsonRecord

export interface JsonRecord {
  readonly [key: string]: JsonValue
}

/**
 * The value domain hook payload records actually carry: the envelope is a
 * JSON string, so `undefined`, functions, and symbols cannot survive it.
 * Real hook output is JSON-parsed and never carries them; the schema states
 * what the wire carries so the envelope round-trip law holds by construction.
 */
export const JsonValueSchema: S.Schema<JsonValue> = S.suspend((): S.Schema<JsonValue> =>
  S.Union([S.Null, S.Boolean, S.Finite, S.String, S.Array(JsonValueSchema), S.Record(S.String, JsonValueSchema)])
).pipe(S.annotate({ identifier: 'JsonValue' }))

export const ParsedHookOutputSchema = S.Struct({
  decision: S.optionalKey(S.String.pipe(S.brand('HookDecision'))),
  reason: S.optionalKey(S.String.pipe(S.brand('HookReason'))),
  hookSpecificOutput: S.optionalKey(
    S.Struct({
      permissionDecision: S.optionalKey(S.String.pipe(S.brand('PermissionDecision'))),
      permissionDecisionReason: S.optionalKey(S.String.pipe(S.brand('PermissionDecisionReason'))),
      updatedInput: S.optionalKey(S.Record(S.String, JsonValueSchema)),
      additionalContext: S.optionalKey(S.String.pipe(S.brand('AdditionalContext'))),
    }),
  ),
})
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

export const HookStdout = S.String.pipe(S.brand('HookStdout'))
export const HookStderr = S.String.pipe(S.brand('HookStderr'))

export const HookResult = S.Struct({
  code: S.Int,
  stdout: HookStdout,
  stderr: HookStderr,
})
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

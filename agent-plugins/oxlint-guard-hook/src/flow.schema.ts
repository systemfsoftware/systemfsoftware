import { Schema as S } from 'effect'
import type { Effect } from 'effect'
import { errorExitCode, errorReported } from 'effect/Runtime'

const ProcessResultSchema = S.Struct({
  exitCode: S.Number,
  stdout: S.String,
  stderr: S.String,
})
export type ProcessResult = S.Schema.Type<typeof ProcessResultSchema>

export const SpawnFailureReasonSchema = S.Union([
  S.Literal('not-found'),
  S.Literal('not-executable'),
  S.Literal('unknown'),
])
export type SpawnFailureReason = S.Schema.Type<typeof SpawnFailureReasonSchema>

export const SpawnFailureSchema = S.Struct({
  reason: SpawnFailureReasonSchema,
  message: S.String,
})
export type SpawnFailure = S.Schema.Type<typeof SpawnFailureSchema>

export const RunOutcomeSchema = S.Union([
  S.TaggedStruct('result', { result: ProcessResultSchema }),
  S.TaggedStruct('timeout', {}),
  S.TaggedStruct('spawn-failure', { failure: SpawnFailureSchema }),
])
export type RunOutcome = S.Schema.Type<typeof RunOutcomeSchema>

export const LintOutcomeSchema = S.Union([
  S.TaggedStruct('outcome', {}),
  S.TaggedStruct('retry-without-type-aware', {}),
  S.TaggedStruct('not-found', {}),
  S.TaggedStruct('violation', { output: S.String }),
])
export type LintOutcome = S.Schema.Type<typeof LintOutcomeSchema>

export const HookResultSchema = S.Struct({
  exitCode: S.Union([S.Literal(0), S.Literal(1), S.Literal(2)]),
  stderr: S.String,
})
export type HookResult = S.Schema.Type<typeof HookResultSchema>

export const AttemptProceedSchema = S.TaggedStruct('proceed', {})
export const AttemptRetrySchema = S.TaggedStruct('retry-plain', {})
export const AttemptRespondSchema = S.TaggedStruct('respond', {
  result: HookResultSchema,
})

export const AttemptOutcomeSchema = S.Union([
  AttemptProceedSchema,
  AttemptRetrySchema,
  AttemptRespondSchema,
])
export type AttemptOutcome = S.Schema.Type<typeof AttemptOutcomeSchema>

export const FinalAttemptSchema = S.Union([
  AttemptProceedSchema,
  AttemptRespondSchema,
])
export type FinalAttempt = S.Schema.Type<typeof FinalAttemptSchema>

/** The wire payload Claude Code posts to the hook on stdin. */
export const WirePayload = S.Struct({
  tool_name: S.String,
  tool_input: S.Struct({ file_path: S.String }),
})

export class GuardWire extends S.TaggedClass<GuardWire>()('GuardWire', {
  toolName: S.String,
  filePath: S.String,
}) {}

export interface FactFields {
  readonly exists: boolean
  readonly denoShebang: boolean
  readonly extension: string
  readonly configPath: string | null
}

export interface GuardRaw {
  readonly wire: GuardWire
  readonly facts: FactFields
}

export interface Runner {
  readonly run: (
    program: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ) => Effect.Effect<RunOutcome, never, never>
}

export interface GuardAdapters {
  readonly gather: (wire: GuardWire) => Effect.Effect<GuardRaw, GuardReadError>
  readonly runner: Runner
  readonly dirname: (target: string) => string
}

export class GuardCommand extends S.TaggedClass<GuardCommand>()('GuardCommand', {
  toolName: S.String,
  filePath: S.String,
  exists: S.Boolean,
  denoShebang: S.Boolean,
  extension: S.String,
  configPath: S.Union([S.String, S.Null]),
}) {}

export class GuardReadError extends S.TaggedError<GuardReadError>()('GuardReadError', {
  message: S.String,
}) {}

export class LintFailure extends S.TaggedError<LintFailure>()('LintFailure', {
  exitCode: S.Union([S.Literal(1), S.Literal(2)]),
  message: S.String,
}) {
  override readonly [errorExitCode]: number = this.exitCode
  override readonly [errorReported]: boolean = true
}

import { Schema as S } from 'effect'
import type { Effect } from 'effect'
import { errorExitCode, errorReported } from 'effect/Runtime'

/** Child exit codes are 0..255 by POSIX convention. */
export const ExitCodeSchema = S.Int.pipe(S.check(S.isBetween({ minimum: 0, maximum: 255 })))
export type ExitCode = S.Schema.Type<typeof ExitCodeSchema>

/** A tool name as the hook runner reports it — never empty. */
export const ToolNameSchema = S.NonEmptyString
export type ToolName = S.Schema.Type<typeof ToolNameSchema>

/** A file path — never empty. */
export const FilePathSchema = S.NonEmptyString
export type FilePath = S.Schema.Type<typeof FilePathSchema>

const ProcessResultSchema = S.Struct({
  exitCode: ExitCodeSchema,
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

export const LintVerdictSchema = S.Union([
  S.TaggedStruct('Pass', {}),
  S.TaggedStruct('RetryWithoutTypeCheck', {}),
  S.TaggedStruct('ToolMissing', {}),
  S.TaggedStruct('Violation', { output: S.String }),
])
export type LintVerdict = S.Schema.Type<typeof LintVerdictSchema>

/** The transport encoding of the hook's answer: exit 0 allows, 1 is a non-blocking error, 2 feeds stderr back. */
export const HookResultSchema = S.Struct({
  exitCode: S.Union([S.Literal(0), S.Literal(1), S.Literal(2)]),
  stderr: S.String,
})
export type HookResult = S.Schema.Type<typeof HookResultSchema>

/** Every reason the lint stands down without blocking the edit — one closed vocabulary. */
export const SkipReasonSchema = S.Union([
  S.Literal('file-missing'),
  S.Literal('not-lintable-extension'),
  S.Literal('no-oxlint-config'),
  S.Literal('oversized-input'),
  S.Literal('unreadable-input'),
  S.Literal('unsupported-tool'),
  S.Literal('linter-timeout'),
])
export type SkipReason = S.Schema.Type<typeof SkipReasonSchema>

/**
 * The workflow's domain output — the events the lint emits, before any transport
 * encoding. The hook contract's exit codes and stderr routing are decided once at
 * the boundary, never inside the pipeline.
 */
export const LintEventSchema = S.Union([
  S.TaggedStruct('Approved', {}),
  S.TaggedStruct('Skipped', { reason: SkipReasonSchema }),
  S.TaggedStruct('Blocked', { diagnostic: S.NonEmptyString }),
  S.TaggedStruct('Errored', { hint: S.NonEmptyString }),
])
export type LintEvent = S.Schema.Type<typeof LintEventSchema>

/** The per-rung verdict the retry ladder computes: keep walking, retry, or stop on an event. */
export const LadderVerdictSchema = S.Union([
  S.TaggedStruct('Proceed', {}),
  S.TaggedStruct('Retry', {}),
  S.TaggedStruct('Halt', { event: LintEventSchema }),
])
export type LadderVerdict = S.Schema.Type<typeof LadderVerdictSchema>

const SkipBase = S.TaggedStruct('Skip', { reason: SkipReasonSchema })
const RunDenoBase = S.TaggedStruct('RunDeno', { filePath: FilePathSchema })
const RunOxlintBase = S.TaggedStruct('RunOxlint', {
  filePath: FilePathSchema,
  configPath: FilePathSchema,
})

export type Skip = S.Schema.Type<typeof SkipBase>
export type RunDeno = S.Schema.Type<typeof RunDenoBase>
export type RunOxlint = S.Schema.Type<typeof RunOxlintBase>
export type LintPlan = Skip | RunDeno | RunOxlint

/** What the encode phase hands the write: either a finished event or one linter run to execute. */
export const LintActionSchema = S.Union([
  S.TaggedStruct('respond', { event: LintEventSchema }),
  RunDenoBase,
  RunOxlintBase,
])
export type LintAction = S.Schema.Type<typeof LintActionSchema>

/** The wire payload Claude Code posts to the hook on stdin. */
export const WirePayload = S.Struct({
  tool_name: ToolNameSchema,
  tool_input: S.Struct({ file_path: FilePathSchema }),
})

export class EditTarget extends S.TaggedClass<EditTarget>()('EditTarget', {
  toolName: ToolNameSchema,
  filePath: FilePathSchema,
}) {}

export const FactFieldsSchema = S.Struct({
  exists: S.Boolean,
  denoShebang: S.Boolean,
  extension: S.String,
  configPath: S.Union([S.String, S.Null]),
})
export type FactFields = S.Schema.Type<typeof FactFieldsSchema>

/** The raw event as the shell reads it from stdin, before any parsing. */
export const UnparsedEditSchema = S.Struct({
  text: S.String,
  overCap: S.Boolean,
})
export type UnparsedEdit = S.Schema.Type<typeof UnparsedEditSchema>

/**
 * The parsed edit sum — the input gate at the context boundary: everything
 * downstream of the decode phase works only with these variants, never with the
 * raw text. An oversized or unparsable payload is an outcome the decision sees
 * as data, never an exception.
 */
export const LintableEditSchema = S.TaggedStruct('LintableEdit', {
  target: EditTarget,
  facts: FactFieldsSchema,
})
export type LintableEdit = S.Schema.Type<typeof LintableEditSchema>
const OversizedEditSchema = S.TaggedStruct('OversizedEdit', {})
const UnreadableEditSchema = S.TaggedStruct('UnreadableEdit', {})

export const ParsedEditSchema = S.Union([
  LintableEditSchema,
  OversizedEditSchema,
  UnreadableEditSchema,
])
export type ParsedEdit = S.Schema.Type<typeof ParsedEditSchema>

export class LintEditCommand extends S.TaggedClass<LintEditCommand>()('LintEditCommand', {
  edit: ParsedEditSchema,
}) {}

/** A gather fault: the file or its config could not be read — infrastructure, not domain. */
export class ReadError extends S.TaggedError<ReadError>()('ReadError', {
  message: S.String,
}) {}

export interface Runner {
  readonly run: (
    program: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ) => Effect.Effect<RunOutcome, never, never>
}

export interface LintAdapters {
  readonly gather: (edit: UnparsedEdit) => Effect.Effect<ParsedEdit, ReadError>
  readonly runner: Runner
  readonly dirname: (target: string) => string
}

export class LintFailure extends S.TaggedError<LintFailure>()('LintFailure', {
  exitCode: S.Union([S.Literal(1), S.Literal(2)]),
  message: S.String,
}) {
  override readonly [errorExitCode]: number = this.exitCode
  // main.ts reports the diagnostic to stderr via Console.error before failing;
  // `false` stops runMain from re-logging the whole failure to stdout.
  override readonly [errorReported]: boolean = false
}

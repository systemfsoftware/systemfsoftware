import * as S from 'effect/Schema'

export const RunPhase = S.Literals(['prepare', 'instrument', 'dry-run', 'mutation-test'])
export type RunPhase = typeof RunPhase.Type

export const OutputMode = S.Literals(['human', 'machine'])
export type OutputMode = typeof OutputMode.Type

export const ModeSignal = S.Literals(['flag', 'env', 'tty', 'agent', 'tool'])
export type ModeSignal = typeof ModeSignal.Type

export const MutantStatus = S.Literals([
  'Killed',
  'Survived',
  'NoCoverage',
  'Timeout',
  'CompileError',
  'RuntimeError',
  'Ignored',
  'Pending',
])
export type MutantStatus = typeof MutantStatus.Type

const Position = S.Struct({
  line: S.Finite,
  column: S.Finite,
})

const Location = S.Struct({
  start: Position,
  end: Position,
})
export type Location = typeof Location.Type
export type Position = typeof Position.Type

export class RunStarted extends S.TaggedClass<RunStarted>()('stream', {
  schemaVersion: S.String,
  runId: S.String,
  mode: OutputMode,
  signal: ModeSignal,
}) {}

export class PhaseEntered extends S.TaggedClass<PhaseEntered>()('phase', {
  phase: RunPhase,
  elapsedMs: S.Finite,
}) {}

export class PlanKnown extends S.TaggedClass<PlanKnown>()('plan', {
  total: S.Finite,
}) {}

export class MutantTested extends S.TaggedClass<MutantTested>()('mutant', {
  id: S.String,
  status: MutantStatus,
  file: S.String,
  location: Location,
  mutator: S.String,
  replacement: S.NullOr(S.String),
  completed: S.Finite,
  total: S.Finite,
}) {}

export class Heartbeat extends S.TaggedClass<Heartbeat>()('tick', {
  elapsedMs: S.Finite,
  completed: S.Finite,
  total: S.NullOr(S.Finite),
}) {}

const VerdictThresholds = S.Struct({
  high: S.Finite,
  low: S.Finite,
  break: S.NullOr(S.Finite),
})
export type VerdictThresholds = typeof VerdictThresholds.Type

const VerdictMutant = S.Struct({
  id: S.String,
  file: S.String,
  location: Location,
  mutator: S.String,
  replacement: S.NullOr(S.String),
  status: MutantStatus,
})
export type VerdictMutant = typeof VerdictMutant.Type

const VerdictCounts = S.Struct({
  killed: S.Finite,
  timeout: S.Finite,
  survived: S.Finite,
  noCoverage: S.Finite,
  runtimeErrors: S.Finite,
  compileErrors: S.Finite,
  ignored: S.Finite,
  pending: S.Finite,
})
export type VerdictCounts = typeof VerdictCounts.Type

export class VerdictReached extends S.TaggedClass<VerdictReached>()('verdict', {
  schemaVersion: S.String,
  runId: S.String,
  mode: OutputMode,
  signal: ModeSignal,
  score: S.NullOr(S.Finite),
  thresholds: VerdictThresholds,
  reportFile: S.NullOr(S.String),
  counts: VerdictCounts,
  mutants: S.Array(VerdictMutant),
}) {}

export class RunFailed extends S.TaggedClass<RunFailed>()('error', {
  schemaVersion: S.String,
  code: S.Finite,
  error: S.String,
  remediation: S.String,
}) {}

export class HelpRendered extends S.TaggedClass<HelpRendered>()('help', {
  schemaVersion: S.String,
  code: S.Literals([0]),
  help: S.String,
}) {}

export const RunEvent = S.Union([
  RunStarted,
  PhaseEntered,
  PlanKnown,
  MutantTested,
  Heartbeat,
  VerdictReached,
  RunFailed,
  HelpRendered,
])
export type RunEvent = typeof RunEvent.Type

export type RunTerminalEvent = VerdictReached | RunFailed | HelpRendered

export class RunCommand extends S.TaggedClass<RunCommand>()('RunCommand', {
  cliOptionsJson: S.String,
  targetMutatePatterns: S.Array(S.String),
}) {}

export class RunOutput extends S.TaggedClass<RunOutput>()('RunOutput', {
  verdictJson: S.String,
  exitCode: S.Finite,
}) {}

export class RunDecodeError extends S.TaggedError<RunDecodeError>()('RunDecodeError', {
  message: S.String,
}) {}

export class RunReadError extends S.TaggedError<RunReadError>()('RunReadError', {
  message: S.String,
}) {}

export class RunWriteError extends S.TaggedError<RunWriteError>()('RunWriteError', {
  message: S.String,
}) {}

export class PlanMutationRunCommand extends S.TaggedClass<PlanMutationRunCommand>()('PlanMutationRunCommand', {
  configMutatePatterns: S.Array(S.String),
  configMutatorNames: S.Array(S.String),
  targetMutatePatterns: S.Array(S.String),
  availableMutators: S.Array(S.String),
}) {}

export class MutationRunPlan extends S.TaggedClass<MutationRunPlan>()('MutationRunPlan', {
  mutatePatterns: S.Array(S.String),
  mutatorNames: S.Array(S.String),
}) {}

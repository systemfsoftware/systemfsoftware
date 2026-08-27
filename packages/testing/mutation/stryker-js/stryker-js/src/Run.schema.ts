import { Wire } from '@systemfsoftware/effect-cell-types'
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

const Position = Wire.wire({
  line: Wire.mint(S.Finite),
  column: Wire.mint(S.Finite),
})

const Location = Wire.wire({
  start: Position,
  end: Position,
})
export type Location = typeof Location.Type
export type Position = typeof Position.Type

export class RunStarted extends S.TaggedClass<RunStarted>()('stream', {
  schemaVersion: Wire.mint(S.String),
  runId: Wire.mint(S.String),
  mode: OutputMode,
  signal: ModeSignal,
}) {}

export class PhaseEntered extends S.TaggedClass<PhaseEntered>()('phase', {
  phase: RunPhase,
  elapsedMs: Wire.mint(S.Finite),
}) {}

export class PlanKnown extends S.TaggedClass<PlanKnown>()('plan', {
  total: Wire.mint(S.Finite),
}) {}

export class MutantTested extends S.TaggedClass<MutantTested>()('mutant', {
  id: Wire.mint(S.String),
  status: MutantStatus,
  file: Wire.mint(S.String),
  location: Location,
  mutator: Wire.mint(S.String),
  replacement: Wire.mint(S.NullOr(Wire.mint(S.String))),
  completed: Wire.mint(S.Finite),
  total: Wire.mint(S.Finite),
}) {}

export class Heartbeat extends S.TaggedClass<Heartbeat>()('tick', {
  elapsedMs: Wire.mint(S.Finite),
  completed: Wire.mint(S.Finite),
  total: Wire.mint(S.NullOr(Wire.mint(S.Finite))),
}) {}

const VerdictThresholds = Wire.wire({
  high: Wire.mint(S.Finite),
  low: Wire.mint(S.Finite),
  break: Wire.mint(S.NullOr(Wire.mint(S.Finite))),
})
export type VerdictThresholds = typeof VerdictThresholds.Type

const VerdictMutant = S.Struct({
  id: Wire.mint(S.String),
  file: Wire.mint(S.String),
  location: Location,
  mutator: Wire.mint(S.String),
  replacement: Wire.mint(S.NullOr(Wire.mint(S.String))),
  status: MutantStatus,
})
export type VerdictMutant = typeof VerdictMutant.Type

const VerdictCounts = Wire.wire({
  killed: Wire.mint(S.Finite),
  timeout: Wire.mint(S.Finite),
  survived: Wire.mint(S.Finite),
  noCoverage: Wire.mint(S.Finite),
  runtimeErrors: Wire.mint(S.Finite),
  compileErrors: Wire.mint(S.Finite),
  ignored: Wire.mint(S.Finite),
  pending: Wire.mint(S.Finite),
})
export type VerdictCounts = typeof VerdictCounts.Type

export class VerdictReached extends S.TaggedClass<VerdictReached>()('verdict', {
  schemaVersion: Wire.mint(S.String),
  runId: Wire.mint(S.String),
  mode: OutputMode,
  signal: ModeSignal,
  score: Wire.mint(S.NullOr(Wire.mint(S.Finite))),
  thresholds: VerdictThresholds,
  reportFile: Wire.mint(S.NullOr(Wire.mint(S.String))),
  counts: VerdictCounts,
  mutants: S.Array(VerdictMutant),
}) {}

export class RunFailed extends S.TaggedClass<RunFailed>()('error', {
  schemaVersion: Wire.mint(S.String),
  code: Wire.mint(S.Finite),
  error: Wire.mint(S.String),
  remediation: Wire.mint(S.String),
}) {}

export class HelpRendered extends S.TaggedClass<HelpRendered>()('help', {
  schemaVersion: Wire.mint(S.String),
  code: Wire.mint(S.Literals([0])),
  help: Wire.mint(S.String),
}) {}

export class ManifestRendered extends S.TaggedClass<ManifestRendered>()('manifest', {
  schemaVersion: Wire.mint(S.String),
  code: Wire.mint(S.Literals([0])),
  manifest: Wire.mint(S.String),
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
  ManifestRendered,
])
export type RunEvent = typeof RunEvent.Type

export type RunTerminalEvent = VerdictReached | RunFailed | HelpRendered | ManifestRendered

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


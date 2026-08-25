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
  line: Wire.number,
  column: Wire.number,
})

const Location = Wire.wire({
  start: Position,
  end: Position,
})
export type Location = typeof Location.Type
export type Position = typeof Position.Type

export class RunStarted extends S.TaggedClass<RunStarted>()('stream', {
  schemaVersion: Wire.string,
  runId: Wire.string,
  mode: OutputMode,
  signal: ModeSignal,
}) {}

export class PhaseEntered extends S.TaggedClass<PhaseEntered>()('phase', {
  phase: RunPhase,
  elapsedMs: Wire.number,
}) {}

export class PlanKnown extends S.TaggedClass<PlanKnown>()('plan', {
  total: Wire.number,
}) {}

export class MutantTested extends S.TaggedClass<MutantTested>()('mutant', {
  id: Wire.string,
  status: MutantStatus,
  file: Wire.string,
  location: Location,
  mutator: Wire.string,
  replacement: Wire.nullOr(Wire.string),
  completed: Wire.number,
  total: Wire.number,
}) {}

export class Heartbeat extends S.TaggedClass<Heartbeat>()('tick', {
  elapsedMs: Wire.number,
  completed: Wire.number,
  total: Wire.nullOr(Wire.number),
}) {}

export class VerdictReached extends S.TaggedClass<VerdictReached>()('verdict', {
  schemaVersion: Wire.string,
  runId: Wire.string,
  mode: OutputMode,
  signal: ModeSignal,
  score: Wire.nullOr(Wire.number),
}) {}

export class RunFailed extends S.TaggedClass<RunFailed>()('error', {
  schemaVersion: Wire.string,
  code: Wire.number,
  error: Wire.string,
  remediation: Wire.string,
}) {}

export class HelpRendered extends S.TaggedClass<HelpRendered>()('help', {
  schemaVersion: Wire.string,
  code: Wire.literal(0),
  help: Wire.string,
}) {}

export class ManifestRendered extends S.TaggedClass<ManifestRendered>()('manifest', {
  schemaVersion: Wire.string,
  code: Wire.literal(0),
  manifest: Wire.string,
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

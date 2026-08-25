/// <reference types="vitest/import-meta" />
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

const VerdictThresholds = Wire.wire({
  high: Wire.number,
  low: Wire.number,
  break: Wire.nullOr(Wire.number),
})
export type VerdictThresholds = typeof VerdictThresholds.Type

const VerdictMutant = S.Struct({
  id: Wire.string,
  file: Wire.string,
  location: Location,
  mutator: Wire.string,
  replacement: Wire.nullOr(Wire.string),
  status: MutantStatus,
})
export type VerdictMutant = typeof VerdictMutant.Type

export class VerdictReached extends S.TaggedClass<VerdictReached>()('verdict', {
  schemaVersion: Wire.string,
  runId: Wire.string,
  mode: OutputMode,
  signal: ModeSignal,
  score: Wire.nullOr(Wire.number),
  thresholds: VerdictThresholds,
  reportFile: Wire.nullOr(Wire.string),
  mutants: S.Array(VerdictMutant),
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

if (import.meta.vitest !== void 0) {
  const { refutes } = await import('@systemfsoftware/effect-schema-law/refutation')
  const { FastCheck: fc } = await import('effect/testing')

  refutes(PlanKnown, {
    PlanKnownNonFinite: fc.constant({ _tag: 'plan', total: Number.POSITIVE_INFINITY }),
  })

  refutes(MutantTested, {
    MutantTestedNonFinite: fc.constant({
      _tag: 'mutant',
      id: 'id',
      status: 'Killed',
      file: 'file.ts',
      location: {
        start: { line: Number.POSITIVE_INFINITY, column: 0 },
        end: { line: 1, column: 0 },
      },
      mutator: 'm',
      replacement: null,
      completed: 1,
      total: 1,
    }),
  })

  refutes(Heartbeat, {
    HeartbeatNonFinite: fc.constant({
      _tag: 'tick',
      elapsedMs: Number.POSITIVE_INFINITY,
      completed: 0,
      total: null,
    }),
  })

  refutes(VerdictReached, {
    VerdictReachedNonFinite: fc.constant({
      _tag: 'verdict',
      schemaVersion: '1',
      runId: 'r',
      mode: 'human',
      signal: 'flag',
      score: Number.POSITIVE_INFINITY,
      thresholds: { high: 100, low: 80, break: null },
      reportFile: null,
      mutants: [],
    }),
  })

  refutes(RunFailed, {
    RunFailedNonFinite: fc.constant({
      _tag: 'error',
      schemaVersion: '1',
      code: Number.POSITIVE_INFINITY,
      error: 'e',
      remediation: 'r',
    }),
  })

  refutes(RunOutput, {
    RunOutputNonFinite: fc.constant({ _tag: 'RunOutput', verdictJson: '{}', exitCode: Number.POSITIVE_INFINITY }),
  })
}

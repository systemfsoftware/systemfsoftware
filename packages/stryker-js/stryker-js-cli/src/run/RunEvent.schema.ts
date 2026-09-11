/**
 * The `RunEvent` machine-stream alphabet — the closed union of every line the
 * CLI's NDJSON stream can carry.
 *
 * Formerly published by the `@systemfsoftware/stryker-js` ABI; the machine
 * stream is the host's own vocabulary (no plugin author reads it), so the
 * alphabet lives here with the engine that emits it and the CLI that frames it.
 * Each class's tag literal IS the wire `kind` `src/Output.ts` frames and
 * `tests/cli-contract.integration.test.ts` decodes.
 *
 * A location and a mutant status are ABI payloads, so the stream carries them
 * through the host's payload bridge; the verdict envelope is the host's own
 * vocabulary. `tests/__fixtures__/cli-contract.schema.ts` independently decodes
 * the same wire shapes, so a drift on either side fails the contract lane.
 */
import * as S from 'effect/Schema'

import { ExitClassPayload, LocationPayload, MutantStatusPayload } from './abi-payload.schema.js'
import type { ModeSignal, OutputMode } from './output-mode.js'

const OutputModeLiterals = ['human', 'machine'] as const satisfies readonly OutputMode[]
const ModeSignalLiterals = ['flag', 'env', 'tty', 'agent', 'tool'] as const satisfies readonly ModeSignal[]

const OutputModeCodec = S.Literals(OutputModeLiterals)
const ModeSignalCodec = S.Literals(ModeSignalLiterals)

const VerdictThresholdsCodec = S.Struct({
  high: S.Finite,
  low: S.Finite,
  break: S.NullOr(S.Finite),
})

const VerdictCountsCodec = S.Struct({
  killed: S.Finite,
  timeout: S.Finite,
  survived: S.Finite,
  noCoverage: S.Finite,
  runtimeErrors: S.Finite,
  compileErrors: S.Finite,
  ignored: S.Finite,
  pending: S.Finite,
})

const VerdictMutantCodec = S.Struct({
  id: S.String,
  file: S.String,
  location: LocationPayload,
  mutator: S.String,
  replacement: S.NullOr(S.String),
  status: MutantStatusPayload,
})

const EvaluatorVerdictCodec = S.Struct({
  exitClass: ExitClassPayload,
  message: S.optional(S.String),
})

const VerdictEvaluatorsCodec = S.Record(S.String, EvaluatorVerdictCodec)

export class RunStarted extends S.TaggedClass<RunStarted>()('stream', {
  schemaVersion: S.String,
  runId: S.String,
  mode: OutputModeCodec,
  signal: ModeSignalCodec,
}) {}

export class PhaseEntered extends S.TaggedClass<PhaseEntered>()('phase', {
  phase: S.String,
  elapsedMs: S.Finite,
}) {}

export class PlanKnown extends S.TaggedClass<PlanKnown>()('plan', {
  total: S.Finite,
}) {}

export class MutantTested extends S.TaggedClass<MutantTested>()('mutant', {
  id: S.String,
  status: MutantStatusPayload,
  file: S.String,
  location: LocationPayload,
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

export class VerdictReached extends S.TaggedClass<VerdictReached>()('verdict', {
  schemaVersion: S.String,
  runId: S.String,
  mode: OutputModeCodec,
  signal: ModeSignalCodec,
  score: S.NullOr(S.Finite),
  thresholds: VerdictThresholdsCodec,
  reportFile: S.NullOr(S.String),
  counts: VerdictCountsCodec,
  mutants: S.Array(VerdictMutantCodec),
  evaluators: S.optional(VerdictEvaluatorsCodec),
}) {}

export class RunFailed extends S.TaggedClass<RunFailed>()('error', {
  schemaVersion: S.String,
  code: S.Finite,
  error: S.String,
  remediation: S.String,
}) {}

export class HelpRendered extends S.TaggedClass<HelpRendered>()('help', {
  schemaVersion: S.String,
  code: S.Finite,
  help: S.String,
}) {}

export type RunEvent =
  | RunStarted
  | PhaseEntered
  | PlanKnown
  | MutantTested
  | Heartbeat
  | VerdictReached
  | RunFailed
  | HelpRendered

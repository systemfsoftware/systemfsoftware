import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { CacheStoreShape } from '../cache/cache-store.service.js'
import { CacheStore } from '../cache/cache-store.service.js'
import { DeriveKey, deriveKey } from '../cache/derive-key.workflow.js'
import { mapFlowText, type TraceEntry } from '../cache/entry.schema.js'
import { agentContextDigestOf, keyDigestOf } from '../cache/key-digest.js'
import { type CacheKeyContext, type KeyDigest } from '../cache/key.schema.js'
import type { StagedRecording } from '../cache/settle-recordings.workflow.js'
import type { EngineShape } from '../engine/engine.service.js'
import { Engine } from '../engine/engine.service.js'
import type { Observation } from '../engine/observation.schema.js'
import type { Route } from '../engine/route.schema.js'
import type { ModelFailure } from '../model/model.schema.js'
import type { ModelGatewayShape } from '../model/model.service.js'
import { ModelGateway } from '../model/model.service.js'
import {
  type Check,
  checkLocatorsOf,
  type CheckRecord,
  type ModelRef,
  type VisionMode,
} from '../verdict/check.schema.js'
import { classifyFailure } from '../verdict/classify.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import {
  type AppNotOpen,
  type ArtifactWriteFailed,
  AssertionFailed,
  AssertionInconclusive,
  type AutomationUnsupported,
  type Evidence,
  type FailureRecord,
  type InternalError,
  type PolicyDenied,
  StepBudgetExhausted,
  StepTimeout,
  type UnsupportedCapability,
} from '../verdict/failure.schema.js'
import { InternalError as InternalErrorClass } from '../verdict/failure.schema.js'
import type { CacheLookup, StepOutcome, TokenUsage } from '../verdict/step-record.schema.js'
import type { ActContext } from './act.js'
import {
  CheckEvaluate,
  checkEvaluate,
  CheckEvaluateDecision,
  type DoesNotHold,
  type LocatorMatches,
  type Unevaluable,
} from './check-evaluate.workflow.js'
import { resolveCheck } from './check-resolver.js'
import {
  JudgmentExhausted,
  JudgmentFailed,
  JudgmentInconclusive,
  JudgmentPassed,
  NextJudgment,
  nextJudgment,
} from './next-judgment.workflow.js'
import { redactedNodeFieldsOf, stableTextOf } from './observation.js'
import type { SecretLedgerShape } from './secret-ledger.service.js'
import { SecretLedger } from './secret-ledger.service.js'
import { visionGate } from './vision.js'

export type JudgmentKind = 'assert' | 'waitFor'

/** The poll interval a `waitFor` step sleeps between observations when no other is named. */
export const JUDGMENT_POLL_INTERVAL: Duration.Duration = Duration.seconds(3)

/** What a finished judgment step reports to its recorder; the run engine builds the AssertStep or WaitForStep. */
export interface JudgmentRecord {
  readonly stepIndex: number
  readonly kind: JudgmentKind
  readonly sentence: string
  /** The judged check; when the step failed before resolving, a synthesized record that never passes (Q7). */
  readonly record: CheckRecord
  readonly outcome: StepOutcome
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
  /** The recording this step stages for the end-of-attempt settlement, when it has one. */
  readonly staged: Option.Option<StagedRecording>
}

export type JudgmentContext = Omit<ActContext, 'record'> & {
  readonly record: (record: JudgmentRecord) => Effect.Effect<void>
}

export type JudgmentFailure =
  | UnsupportedCapability
  | PolicyDenied
  | AutomationUnsupported
  | ArtifactWriteFailed
  | AppNotOpen
  | ModelFailure
  | AssertionFailed
  | AssertionInconclusive
  | StepBudgetExhausted
  | StepTimeout
  | InternalError

type LoopServices = Engine | ModelGateway | SecretLedger

export interface JudgmentSuccess {
  readonly record: CheckRecord
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

/** The shared judgment run: one request object drives either shell's whole flow (design §8.2). */
export interface JudgedRequest {
  readonly context: JudgmentContext
  readonly mode: JudgmentKind
  readonly sentence: string
  readonly vision: VisionMode
  readonly timeout: Duration.Duration
  /** The `waitFor` poll interval; unused in `assert` mode, which never polls. */
  readonly interval: Duration.Duration
  readonly maxModelCalls: number
}

interface RecordedCheck {
  readonly record: CheckRecord
  readonly resolvedOn: Route
  readonly entry: TraceEntry
}

interface FreshCheck {
  readonly check: Check
  readonly record: CheckRecord
  readonly route: Route
}

type StalledEvaluation = DoesNotHold | Unevaluable

interface Stalled {
  readonly evaluation: StalledEvaluation
  readonly observation: Observation
  readonly record: CheckRecord
}

interface Keying {
  readonly digest: KeyDigest
  readonly context: CacheKeyContext
}

interface JudgmentState {
  readonly keying: Option.Option<Keying>
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
  readonly recorded: Option.Option<RecordedCheck>
  readonly fresh: Option.Option<FreshCheck>
  readonly resolvedAgainst: Option.Option<Observation>
  readonly stalled: Option.Option<Stalled>
  readonly record: Option.Option<CheckRecord>
  readonly failure: Option.Option<FailureRecord>
  readonly staged: Option.Option<StagedRecording>
}

interface JudgmentStep {
  readonly context: JudgmentContext
  readonly mode: JudgmentKind
  readonly sentence: string
  readonly vision: VisionMode
  readonly timeout: Duration.Duration
  readonly interval: Duration.Duration
  readonly maxModelCalls: number
  readonly engine: EngineShape
  readonly gateway: ModelGatewayShape
  readonly store: CacheStoreShape
  readonly ledger: SecretLedgerShape
  readonly state: Ref.Ref<JudgmentState>
}

/** The loop's terminal decisions and the data each one carries back to the shell. */
type TerminalJudgment = JudgmentPassed | JudgmentFailed | JudgmentInconclusive | JudgmentExhausted

interface Judged {
  readonly decision: TerminalJudgment
  readonly record: CheckRecord
  readonly evaluation: CheckEvaluateDecision
  readonly observation: Observation
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
  readonly staged: Option.Option<StagedRecording>
}

interface EvaluateInput {
  readonly check: Check
  readonly route: Route
  readonly resolvedOn: Route
}

const decided = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const logEvidence = (text: string): Evidence => [{ _tag: 'LogEvidence', text }]

const addTokens = (left: TokenUsage, right: TokenUsage): TokenUsage => ({
  input: left.input + right.input,
  output: left.output + right.output,
})

/** The write phase hands the decision back encoded; it is decoded where the shell reads it. A decode
 * failure is an automation inconsistency, not a verdict. */
const decodeDecision = (
  encoded: (typeof CheckEvaluateDecision)['Encoded'],
): Effect.Effect<CheckEvaluateDecision, InternalError> =>
  Result.match(
    Schema.decodeResult(CheckEvaluateDecision)(encoded),
    {
      onFailure: (issue) =>
        Effect.fail(
          new InternalErrorClass({
            message: issue.message,
            evidence: logEvidence('the evaluation decision did not decode'),
          }),
        ),
      onSuccess: (decision) => Effect.succeed(decision),
    },
  )

const queriedOf = (
  engine: EngineShape,
  ledger: SecretLedgerShape,
  locator: Parameters<EngineShape['query']>[0],
): Effect.Effect<LocatorMatches, never> =>
  Effect.map(
    Effect.result(engine.query(locator)),
    (outcome) =>
      Result.getOrElse(
        Result.map(outcome, (nodes): LocatorMatches => ({
          _tag: 'Queried',
          locator,
          nodes: Arr.map(nodes, (node) => redactedNodeFieldsOf(node, ledger.redactCut)),
        })),
        (): LocatorMatches => ({ _tag: 'Unqueryable', locator }),
      ),
  )

const evaluateRead = (input: EvaluateInput): Effect.Effect<(typeof CheckEvaluate)['Encoded'], never, LoopServices> =>
  Effect.gen(function*() {
    const engine = yield* Engine
    const ledger = yield* SecretLedger
    const located = yield* Effect.forEach(checkLocatorsOf(input.check), (locator) => queriedOf(engine, ledger, locator))
    return {
      _tag: 'CheckEvaluate',
      check: input.check,
      route: input.route,
      resolvedOn: input.resolvedOn,
      located,
    }
  })

/**
 * The evaluation step of KTD8 as one cell: query each leaf locator and redact the nodes in read,
 * decide with the pure `checkEvaluate`, hand the decision back in write (design §6.4).
 */
const evaluate = Sandwich.named('e2e/assert-step')(evaluateRead).decide(checkEvaluate).write({
  Holds: (decision) => Effect.succeed(decision),
  DoesNotHold: (decision) => Effect.succeed(decision),
  Unevaluable: (decision) => Effect.succeed(decision),
  CommandRejected: (refused): Effect.Effect<(typeof CheckEvaluateDecision)['Encoded'], InternalError> =>
    Effect.fail(
      new InternalErrorClass({
        message: refused.issue,
        evidence: logEvidence('the evaluation command did not decode'),
      }),
    ),
})

const keyingOf = (step: JudgmentStep): Option.Option<Keying> => {
  const { cache, agent } = step.context
  const decision = decided(
    deriveKey(
      new DeriveKey({
        mode: cache.mode,
        step: 'judgment',
        project: cache.project,
        test: cache.test,
        target: cache.target,
        engine: cache.engine,
        engineVersion: cache.engineVersion,
        app: cache.app,
        instruction: step.sentence,
        params: {},
        agent: { name: agent.name, contextDigest: agentContextDigestOf(agent.config.context) },
        modelId: agent.config.model.model,
      }),
    ),
  )
  return Match.valueTags(decision, {
    Keyed: ({ context, canonical }) => Option.some({ digest: keyDigestOf(canonical), context }),
    Unkeyed: () => Option.none(),
  })
}

/** Only an entry with exactly one check is usable; zero or several checks read as a miss. */
const singleCheckOf = (checks: ReadonlyArray<Check>): Option.Option<Check> =>
  Match.value(checks.length).pipe(
    Match.when(1, () => Arr.head(checks)),
    Match.orElse((): Option.Option<Check> => Option.none()),
  )

const recordedOf = (step: JudgmentStep, entry: TraceEntry): Option.Option<RecordedCheck> =>
  Option.map(singleCheckOf(entry.checks), (check) => ({
    record: {
      sentence: step.sentence,
      check,
      evidence: [],
      vision: step.vision,
    },
    resolvedOn: entry.start,
    entry,
  }))

const lookupOf = (keying: Option.Option<Keying>, hit: Option.Option<RecordedCheck>): CacheLookup =>
  Option.match(keying, {
    onNone: (): CacheLookup => ({ _tag: 'Off' }),
    onSome: () =>
      Option.match(hit, {
        onNone: (): CacheLookup => ({ _tag: 'Missed' }),
        onSome: (): CacheLookup => ({ _tag: 'Replayed' }),
      }),
  })

const prepared = (step: JudgmentStep): Effect.Effect<void, UnsupportedCapability, CacheStore> =>
  Effect.gen(function*() {
    yield* visionGate({
      mode: step.vision,
      modelVision: step.context.agent.config.model.vision,
      capabilities: step.engine.capabilities,
    })
    const keying = keyingOf(step)
    const hit: Option.Option<RecordedCheck> = yield* Option.match(keying, {
      onNone: () => Effect.succeed(Option.none<RecordedCheck>()),
      onSome: (keyed) =>
        Effect.map(step.store.read(keyed.digest), (read) =>
          Match.valueTags(read, {
            Hit: ({ entry }): Option.Option<RecordedCheck> => recordedOf(step, entry),
            Miss: (): Option.Option<RecordedCheck> => Option.none(),
            Invalid: (): Option.Option<RecordedCheck> => Option.none(),
          })),
    })
    yield* Ref.update(step.state, (state) => ({
      ...state,
      keying,
      lookup: lookupOf(keying, hit),
      recorded: hit,
    }))
  })

interface JudgedTarget {
  readonly check: Check
  readonly resolvedOn: Route
  readonly record: CheckRecord
  readonly source: 'recorded' | 'fresh'
}

const targetOf = (state: JudgmentState): Option.Option<JudgedTarget> =>
  Option.match(state.fresh, {
    onNone: () =>
      Option.map(state.recorded, (recorded): JudgedTarget => ({
        check: recorded.record.check,
        resolvedOn: recorded.resolvedOn,
        record: recorded.record,
        source: 'recorded',
      })),
    onSome: (fresh): Option.Option<JudgedTarget> =>
      Option.some({
        check: fresh.check,
        resolvedOn: fresh.route,
        record: fresh.record,
        source: 'fresh',
      }),
  })

const resolveOf = (step: JudgmentStep, current: Observation): Effect.Effect<void, JudgmentFailure, LoopServices> =>
  Effect.gen(function*() {
    const state = yield* Ref.get(step.state)
    const resolved = yield* resolveCheck({
      sentence: step.sentence,
      kind: step.mode,
      vision: step.vision,
      observation: current,
      agent: step.context.agent.config,
      modelCalls: state.modelCalls,
      maxModelCalls: step.maxModelCalls,
    })
    yield* Ref.update(step.state, (latest) => ({
      ...latest,
      fresh: Option.some({ check: resolved.check, record: resolved.record, route: current.route }),
      resolvedAgainst: Option.some(current),
      modelCalls: latest.modelCalls + resolved.modelCalls,
      tokens: addTokens(latest.tokens, resolved.tokens),
    }))
  })

const changedOf = (state: JudgmentState, current: Observation): boolean =>
  Option.match(state.resolvedAgainst, {
    onNone: () => true,
    onSome: (against) => stableTextOf(against) !== stableTextOf(current),
  })

const stalledOf = (evaluation: CheckEvaluateDecision): Option.Option<StalledEvaluation> =>
  Match.value(evaluation).pipe(
    Match.tag('Holds', () => Option.none<StalledEvaluation>()),
    Match.orElse((evaluation: DoesNotHold | Unevaluable) => Option.some(evaluation)),
  )

const judgedOf = (
  state: JudgmentState,
  decision: TerminalJudgment,
  record: CheckRecord,
  evaluation: CheckEvaluateDecision,
  observation: Observation,
  staged: Option.Option<StagedRecording>,
): Judged => ({
  decision,
  record,
  evaluation,
  observation,
  lookup: state.lookup,
  modelCalls: state.modelCalls,
  tokens: state.tokens,
  staged,
})

/** The judgment entry: a trace-1 flow with no actions or anchors, one check, the resolution route at both ends. */
const entryOf = (step: JudgmentStep, keying: Keying, fresh: FreshCheck): Option.Option<TraceEntry> =>
  mapFlowText(
    {
      schema: 'trace-1',
      keyedBy: keying.context,
      start: fresh.route,
      actions: [],
      end: fresh.route,
      anchors: { appeared: [], gone: [] },
      checks: [fresh.check],
      alerts: [],
      provenance: {
        engine: step.context.cache.engine,
        engineVersion: step.context.cache.engineVersion,
        model: Option.getOrElse(Option.fromNullishOr(fresh.record.resolvedBy), (): ModelRef => ({
          provider: 'none',
          model: 'none',
        })),
        agent: step.context.agent.name,
        version: step.context.cache.version,
      },
    },
    (text) => Option.some(step.ledger.redact(text)),
  )

const stagedOf = (step: JudgmentStep, state: JudgmentState): Option.Option<StagedRecording> =>
  Option.match(state.keying, {
    onNone: () => Option.none<StagedRecording>(),
    onSome: (keying) =>
      Option.match(state.fresh, {
        onNone: () =>
          Option.some<StagedRecording>({
            stepIndex: step.context.stepIndex,
            digest: keying.digest,
            recording: { _tag: 'Keep' },
          }),
        onSome: (fresh) =>
          Option.map(entryOf(step, keying, fresh), (entry) => ({
            stepIndex: step.context.stepIndex,
            digest: keying.digest,
            recording: Option.match(state.recorded, {
              onNone: (): StagedRecording['recording'] => ({ _tag: 'Write', entry }),
              onSome: (recorded): StagedRecording['recording'] => ({
                _tag: 'Overwrite',
                entry,
                existing: recorded.entry,
              }),
            }),
          })),
      }),
  })

const passedOf = (
  step: JudgmentStep,
  state: JudgmentState,
  record: CheckRecord,
  evaluation: CheckEvaluateDecision,
  observation: Observation,
): Effect.Effect<Judged, never> => {
  const staged = stagedOf(step, state)
  return Effect.map(
    Ref.update(step.state, (latest) => ({ ...latest, staged })),
    () => judgedOf(state, new JudgmentPassed({}), record, evaluation, observation, staged),
  )
}

/** A timeout maps to the last evaluation (Q5): a judged-false screen is a product failure, an unevaluable one
 * ends inconclusive, and a screen never evaluated is a plain step timeout. */
const timeoutJudged = (step: JudgmentStep): Effect.Effect<Option.Option<Judged>, never> =>
  Effect.map(
    Ref.get(step.state),
    (state) =>
      Option.map(state.stalled, ({ evaluation, observation, record }): Judged =>
        Match.value(evaluation).pipe(
          Match.tag('DoesNotHold', (doesNotHold) =>
            judgedOf(state, new JudgmentFailed({}), record, doesNotHold, observation, Option.none())),
          Match.tag('Unevaluable', (unevaluable) =>
            judgedOf(state, new JudgmentInconclusive({}), record, unevaluable, observation, Option.none())),
          Match.exhaustive,
        )),
  )

const timedOutOf = (step: JudgmentStep): StepTimeout =>
  new StepTimeout({
    message: `the step did not judge its statement within ${Duration.toMillis(step.timeout)} ms`,
    evidence: logEvidence(`timeout ${Duration.toMillis(step.timeout)} ms`),
  })

const loopTimed = (step: JudgmentStep): Effect.Effect<Judged, JudgmentFailure, LoopServices> =>
  Effect.flatMap(
    Effect.asSome(Effect.flatMap(step.engine.observe, (current) => turned(step, current))).pipe(
      Effect.timeoutOrElse({ duration: step.timeout, orElse: () => timeoutJudged(step) }),
    ),
    Option.match({
      onNone: () => Effect.fail(timedOutOf(step)),
      onSome: (judged) => Effect.succeed(judged),
    }),
  )

const assertionFailedOf = (step: JudgmentStep, judged: Judged): AssertionFailed =>
  new AssertionFailed({
    message: step.ledger.redact(`the statement did not hold: ${step.sentence}`),
    evidence: judged.evaluation.evidence,
  })

const inconclusiveErrorOf = (step: JudgmentStep, judged: Judged): AssertionInconclusive =>
  new AssertionInconclusive({
    message: step.ledger.redact(`the statement could not be evaluated: ${step.sentence}`),
    evidence: judged.evaluation.evidence,
  })

const exhaustedErrorOf = (step: JudgmentStep): StepBudgetExhausted =>
  new StepBudgetExhausted({
    message: `the step used all ${step.maxModelCalls} model calls it may make without judging the statement`,
    evidence: logEvidence(`budget model-calls ${step.maxModelCalls}`),
  })

const classifiedOf = (
  step: JudgmentStep,
  judged: Judged,
): Effect.Effect<JudgmentSuccess, JudgmentFailure, LoopServices> =>
  Effect.flatMap(
    classifyFailure({
      failure: {
        code: 'ASSERTION_FAILED',
        cause: failureClassOf('ASSERTION_FAILED').cause,
        evidence: judged.evaluation.evidence,
      },
      sentence: step.sentence,
      observation: judged.observation,
      agent: step.context.agent.config,
      timeout: step.timeout,
    }),
    (classified) =>
      Effect.andThen(
        Ref.update(step.state, (state) => ({
          ...state,
          modelCalls: state.modelCalls + classified.modelCalls,
          tokens: addTokens(state.tokens, classified.tokens),
          failure: Option.some(classified.failure),
        })),
        (): Effect.Effect<JudgmentSuccess, AssertionFailed> => Effect.fail(assertionFailedOf(step, judged)),
      ),
  )

const successOf = (judged: Judged): JudgmentSuccess => ({
  record: judged.record,
  lookup: judged.lookup,
  modelCalls: judged.modelCalls,
  tokens: judged.tokens,
})

const outcomed = (
  step: JudgmentStep,
  judged: Judged,
): Effect.Effect<JudgmentSuccess, JudgmentFailure, LoopServices> =>
  Match.valueTags(judged.decision, {
    JudgmentPassed: () => Effect.succeed(successOf(judged)),
    JudgmentFailed: () => classifiedOf(step, judged),
    JudgmentInconclusive: () => Effect.fail(inconclusiveErrorOf(step, judged)),
    JudgmentExhausted: () => Effect.fail(exhaustedErrorOf(step)),
  })

const DIED: StepOutcome = {
  _tag: 'Failed',
  code: 'INTERNAL_ERROR',
  cause: failureClassOf('INTERNAL_ERROR').cause,
  evidence: logEvidence('the judgment step died'),
}

const logTextOf = (evidence: Evidence): string =>
  Match.value(Arr.headNonEmpty(evidence)).pipe(
    Match.tag('LogEvidence', ({ text }) => text),
    Match.orElse(() => 'no reason recorded'),
  )

const outcomeEvidenceOf = (outcome: StepOutcome): Evidence =>
  Match.value(outcome).pipe(
    Match.tag('Inconclusive', ({ evidence }) => evidence),
    Match.tag('Failed', ({ evidence }) => evidence),
    Match.orElse(() => logEvidence('no check was resolved')),
  )

/** The record a failure before resolution still carries: the sentence, a check that never passes, and why (Q7). */
const synthesizedOf = (step: JudgmentStep, outcome: StepOutcome): CheckRecord => ({
  sentence: step.sentence,
  check: { _tag: 'AllOf', checks: [] },
  evidence: logEvidence(logTextOf(outcomeEvidenceOf(outcome))),
  vision: step.vision,
})

const outcomeOfError = (error: JudgmentFailure): StepOutcome =>
  Match.value(error).pipe(
    Match.tag('ASSERTION_INCONCLUSIVE', (error): StepOutcome => ({
      _tag: 'Inconclusive',
      code: 'ASSERTION_INCONCLUSIVE',
      evidence: error.evidence,
    })),
    Match.orElse((error): StepOutcome => ({
      _tag: 'Failed',
      code: error._tag,
      cause: failureClassOf(error._tag).cause,
      evidence: error.evidence,
    })),
  )

const outcomeOf = (exit: Exit.Exit<JudgmentSuccess, JudgmentFailure>): Option.Option<StepOutcome> =>
  Exit.match(exit, {
    onSuccess: (): Option.Option<StepOutcome> => Option.some({ _tag: 'Passed' }),
    onFailure: (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Option.none()
        : Option.some(
          cause.pipe(
            Cause.findErrorOption,
            Option.match({ onNone: () => DIED, onSome: outcomeOfError }),
          ),
        ),
  })

/** The classified failure replaces the raw one on the record, so `proposed` rides on the outcome (KTD13). */
const withProposed = (outcome: StepOutcome, state: JudgmentState): StepOutcome =>
  Match.value(outcome).pipe(
    Match.tag('Failed', (failed) =>
      Option.match(state.failure, {
        onNone: () => outcome,
        onSome: (failure) => ({ ...failed, ...failure }),
      })),
    Match.orElse(() => outcome),
  )

const recordOf = (step: JudgmentStep, state: JudgmentState, outcome: StepOutcome): JudgmentRecord => ({
  stepIndex: step.context.stepIndex,
  kind: step.mode,
  sentence: step.sentence,
  record: Option.getOrElse(state.record, () => synthesizedOf(step, outcome)),
  outcome: withProposed(outcome, state),
  lookup: state.lookup,
  modelCalls: state.modelCalls,
  tokens: state.tokens,
  staged: Match.value(outcome).pipe(
    Match.tag('Passed', () => state.staged),
    Match.orElse((): Option.Option<StagedRecording> => Option.none()),
  ),
})

/** A cancelled step records nothing, so the cache is left as it was (design §9.5). */
const recorded = (step: JudgmentStep, exit: Exit.Exit<JudgmentSuccess, JudgmentFailure>): Effect.Effect<void> =>
  Option.match(outcomeOf(exit), {
    onNone: () => Effect.void,
    onSome: (outcome) =>
      Effect.flatMap(Ref.get(step.state), (state) => step.context.record(recordOf(step, state, outcome))),
  })

const FRESH_STATE: JudgmentState = {
  keying: Option.none(),
  lookup: { _tag: 'Off' },
  modelCalls: 0,
  tokens: { input: 0, output: 0 },
  recorded: Option.none(),
  fresh: Option.none(),
  resolvedAgainst: Option.none(),
  stalled: Option.none(),
  record: Option.none(),
  failure: Option.none(),
  staged: Option.none(),
}

const stepOf = (request: JudgedRequest) =>
  Effect.gen(function*() {
    return {
      context: request.context,
      mode: request.mode,
      sentence: request.sentence,
      vision: request.vision,
      timeout: request.timeout,
      interval: request.interval,
      maxModelCalls: request.maxModelCalls,
      engine: yield* Engine,
      gateway: yield* ModelGateway,
      store: yield* CacheStore,
      ledger: yield* SecretLedger,
      state: yield* Ref.make(FRESH_STATE),
    } satisfies JudgmentStep
  })

const evaluatedOf = (
  step: JudgmentStep,
  current: Observation,
  target: JudgedTarget,
): Effect.Effect<Judged, JudgmentFailure, LoopServices> =>
  Effect.gen(function*() {
    const encoded = yield* evaluate.run({
      check: target.check,
      route: current.route,
      resolvedOn: target.resolvedOn,
    })
    const evaluation = yield* decodeDecision(encoded)
    const record: CheckRecord = { ...target.record, evidence: [...target.record.evidence, ...evaluation.evidence] }
    yield* Ref.update(step.state, (state) => ({
      ...state,
      record: Option.some(record),
      stalled: Option.match(stalledOf(evaluation), {
        onNone: () => state.stalled,
        onSome: (evaluation) => Option.some<Stalled>({ evaluation, observation: current, record }),
      }),
    }))
    const state = yield* Ref.get(step.state)
    const decision = decided(
      nextJudgment(
        new NextJudgment({
          mode: step.mode,
          source: target.source,
          evaluation: evaluation._tag,
          changed: changedOf(state, current),
          modelCalls: state.modelCalls,
          maxModelCalls: step.maxModelCalls,
        }),
      ),
    )
    return yield* Match.valueTags(decision, {
      JudgmentPassed: () => passedOf(step, state, record, evaluation, current),
      JudgmentFailed: () =>
        Effect.succeed(
          judgedOf(state, new JudgmentFailed({}), record, evaluation, current, Option.none()),
        ),
      JudgmentInconclusive: () =>
        Effect.succeed(
          judgedOf(state, new JudgmentInconclusive({}), record, evaluation, current, Option.none()),
        ),
      JudgmentResolve: () => Effect.andThen(resolveOf(step, current), () => turned(step, current)),
      JudgmentPoll: () =>
        Effect.andThen(Effect.sleep(step.interval), () =>
          Effect.flatMap(step.engine.observe, (next) => turned(step, next))),
      JudgmentExhausted: () =>
        Effect.succeed(
          judgedOf(state, new JudgmentExhausted({}), record, evaluation, current, Option.none()),
        ),
    })
  })

const turned = (step: JudgmentStep, current: Observation): Effect.Effect<Judged, JudgmentFailure, LoopServices> =>
  Effect.flatMap(Ref.get(step.state), (state) =>
    Option.match(targetOf(state), {
      onNone: () => Effect.andThen(resolveOf(step, current), () => turned(step, current)),
      onSome: (target) => evaluatedOf(step, current, target),
    }))

const stepped = (
  step: JudgmentStep,
): Effect.Effect<JudgmentSuccess, JudgmentFailure, Engine | ModelGateway | CacheStore | SecretLedger> =>
  Effect.flatMap(prepared(step), () => Effect.flatMap(loopTimed(step), (judged) => outcomed(step, judged)))

/**
 * Runs one judgment step of design §8.2: the vision gate, the judgment cache, one resolution with at
 * most one repair, the pure evaluation, and the `nextJudgment` loop — classifying a failure after the
 * timed section and recording exactly once on success or failure, never on interruption.
 */
export const judged = (
  request: JudgedRequest,
): Effect.Effect<JudgmentSuccess, JudgmentFailure, Engine | ModelGateway | CacheStore | SecretLedger> =>
  Effect.flatMap(stepOf(request), (step) => stepped(step).pipe(Effect.onExit((exit) => recorded(step, exit))))

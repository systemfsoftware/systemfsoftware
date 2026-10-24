import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import { Base64 } from 'effect/encoding'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { CacheStoreShape } from '../cache/cache-store.service.js'
import { CacheStore } from '../cache/cache-store.service.js'
import {
  ClassifyReplay,
  classifyReplay,
  type ReplayDecision,
  type ReplayStep,
} from '../cache/classify-replay.workflow.js'
import { DeriveKey, deriveKey } from '../cache/derive-key.workflow.js'
import { expandSlots, mapFlowText, type RecordedAction, type TraceEntry } from '../cache/entry.schema.js'
import { agentContextDigestOf, keyDigestOf } from '../cache/key-digest.js'
import {
  type CacheKeyContext,
  type EngineIdentity,
  type KeyDigest,
  type StepParams,
  uniqueSlotsOf,
} from '../cache/key.schema.js'
import type { StagedRecording } from '../cache/settle-recordings.workflow.js'
import { TemplateUniqueSlots, templateUniqueSlots } from '../cache/template-unique-slots.workflow.js'
import type { AgentConfig, CacheMode } from '../Config/config.schema.js'
import { SecretRef } from '../Config/names.schema.js'
import type { Action } from '../engine/action.schema.js'
import type { EngineShape } from '../engine/engine.service.js'
import { Engine } from '../engine/engine.service.js'
import type { Observation } from '../engine/observation.schema.js'
import type { Message, ModelAnswer, ModelFailure, ModelRequest, ModelResponse } from '../model/model.schema.js'
import type { ModelGatewayShape } from '../model/model.service.js'
import { ModelGateway } from '../model/model.service.js'
import type { TelemetryShape, TelemetrySpan } from '../run/telemetry.service.js'
import { Telemetry } from '../run/telemetry.service.js'
import type { ModelRef } from '../verdict/check.schema.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import {
  type ActionFailed,
  type AppNotOpen,
  type AppUnreachable,
  type ArtifactWriteFailed,
  type AutomationUnsupported,
  type Evidence,
  type FailureCode,
  type LocatorAmbiguous,
  type LocatorNotFound,
  type PolicyDenied,
  type SecretUnavailable,
  StepBudgetExhausted,
  StepTimeout,
  UnsupportedCapability,
} from '../verdict/failure.schema.js'
import type { ActionRecord, CacheLookup, StepOutcome, TokenUsage } from '../verdict/step-record.schema.js'
import {
  actRequestOf,
  actTools,
  assistantMessageOf,
  describeAction,
  observationMessageOf,
  skippedRepliesOf,
  systemPromptOf,
  taskMessageOf,
  toolResultOf,
} from './act-prompt.js'
import { type Capture, type Execute, NextAct, nextAct, type NextActDecision } from './next-act.workflow.js'
import { formatObservation, stableTextOf } from './observation.js'
import { recordedFlow, RecordFlow } from './recorded-flow.workflow.js'
import { redactMessage, redactRequest } from './redaction.js'
import type { SecretLedgerShape } from './secret-ledger.service.js'
import { SecretLedger } from './secret-ledger.service.js'
import {
  annotated,
  cacheOutcomeOf,
  counted,
  engineActionAttributesOf,
  spannedGateway,
  stepAttributesOf,
} from './step-telemetry.js'

/** One committed action, as `onAction` receives it. */
export interface ActionEvent {
  readonly index: number
  readonly action: Action
  readonly summary: string
  readonly source: 'model' | 'replay'
}

export interface ActOptions {
  /** Values the instruction names as `{name}`; a `Secret` reaches the model by name only. */
  readonly params?: StepParams | undefined
  readonly maxSteps?: number | undefined
  readonly maxModelCalls?: number | undefined
  readonly timeout?: Duration.Input | undefined
  readonly onAction?: ((event: ActionEvent) => Effect.Effect<void>) | undefined
}

/** One `act` call: the step's context, the goal in natural language, and its options. */
export interface ActRequest extends ActOptions {
  readonly context: ActContext
  readonly instruction: string
}

/** What a finished step reports to its recorder; the run engine builds the `ActStep` from it. */
export interface ActRecord {
  readonly stepIndex: number
  readonly instruction: string
  readonly params: StepParams
  readonly actions: ReadonlyArray<ActionRecord>
  readonly summary: string
  readonly outcome: StepOutcome
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
  /** The recording this step stages for the end-of-attempt settlement, when it has one. */
  readonly staged: Option.Option<StagedRecording>
}

/** Who runs the step, how it is keyed, and where its record goes. */
export interface ActContext {
  readonly stepIndex: number
  readonly agent: { readonly name: CacheKeyContext['agent']['name']; readonly config: AgentConfig }
  readonly cache: {
    readonly mode: CacheMode
    readonly project: CacheKeyContext['project']
    readonly test: CacheKeyContext['test']
    readonly target: CacheKeyContext['target']
    readonly engine: EngineIdentity
    readonly engineVersion: string
    readonly app: string
    /** The framework version a recording names in its provenance. */
    readonly version: string
  }
  /** The step timeout when the options name none. */
  readonly timeout: Duration.Input
  readonly record: (record: ActRecord) => Effect.Effect<void>
}

export interface ActResult {
  readonly summary: string
  readonly cache: CacheLookup
  readonly modelCalls: number
  readonly actions: ReadonlyArray<ActionRecord>
}

export type ActFailure =
  | SecretUnavailable
  | StepBudgetExhausted
  | StepTimeout
  | UnsupportedCapability
  | PolicyDenied
  | ModelFailure
  | AppNotOpen
  | AppUnreachable
  | AutomationUnsupported
  | ArtifactWriteFailed

type Rejection = LocatorNotFound | LocatorAmbiguous | ActionFailed | AutomationUnsupported

const REJECTIONS = ['LOCATOR_NOT_FOUND', 'LOCATOR_AMBIGUOUS', 'ACTION_FAILED', 'AUTOMATION_UNSUPPORTED'] as const

const SETTLE_ROUNDS = 5

interface Keying {
  readonly digest: KeyDigest
  readonly context: CacheKeyContext
}

interface Run {
  readonly actions: ReadonlyArray<ActionRecord>
  readonly recorded: ReadonlyArray<RecordedAction>
  readonly replayed: ReadonlyArray<Action>
  readonly steps: number
  readonly modelCalls: number
  readonly tokens: TokenUsage
  readonly lookup: CacheLookup
  readonly history: ReadonlyArray<Message>
  readonly screenshot: Option.Option<string>
  readonly served: Option.Option<ModelRef>
  readonly existing: Option.Option<TraceEntry>
  readonly staged: Option.Option<StagedRecording>
  readonly summary: string
}

interface Step {
  readonly context: ActContext
  readonly instruction: string
  readonly params: StepParams
  readonly secrets: ReadonlyArray<string>
  readonly maxSteps: number
  readonly maxModelCalls: number
  readonly timeout: Duration.Duration
  readonly onAction: (event: ActionEvent) => Effect.Effect<void>
  readonly engine: EngineShape
  readonly gateway: ModelGatewayShape
  readonly store: CacheStoreShape
  readonly ledger: SecretLedgerShape
  readonly telemetry: TelemetryShape
  readonly run: Ref.Ref<Run>
}

interface Finished {
  readonly summary: string
  readonly end: Observation
}

const FRESH_RUN: Run = {
  actions: [],
  recorded: [],
  replayed: [],
  steps: 0,
  modelCalls: 0,
  tokens: { input: 0, output: 0 },
  lookup: { _tag: 'Off' },
  history: [],
  screenshot: Option.none(),
  served: Option.none(),
  existing: Option.none(),
  staged: Option.none(),
  summary: '',
}

const decided = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const logEvidence = (text: string): Evidence => [{ _tag: 'LogEvidence', text }]

const isSecretRef = Schema.is(SecretRef)

const secretNamesOf = (params: StepParams): ReadonlyArray<string> =>
  Object.values(params).flatMap((value) => (isSecretRef(value) ? [value.secret] : []))

const update = (step: Step, change: (run: Run) => Run): Effect.Effect<void> => Ref.update(step.run, change)

const settledAgainst = (previous: Observation, rounds: number) => (next: Observation): boolean =>
  [stableTextOf(next) === stableTextOf(previous), rounds <= 1].includes(true)

const settleFrom = (
  engine: EngineShape,
  previous: Observation,
  rounds: number,
): Effect.Effect<Observation, AppNotOpen> =>
  engine.observe.pipe(
    Effect.filterOrElse(settledAgainst(previous, rounds), (next) => settleFrom(engine, next, rounds - 1)),
  )

/** Observes until two consecutive trees agree, without sleeping, so a re-render after an action is seen. */
const settled = (engine: EngineShape): Effect.Effect<Observation, AppNotOpen> =>
  Effect.flatMap(engine.observe, (first) => settleFrom(engine, first, SETTLE_ROUNDS))

/** The action the engine runs: a secret is filled with its value here, and only here. */
const resolvedOf = (step: Step, action: Action): Effect.Effect<Action, SecretUnavailable> =>
  Match.value(action).pipe(
    Match.tag('Fill', (fill) =>
      isSecretRef(fill.value)
        ? Effect.map(step.ledger.fill(fill.value), (value): Action => ({ ...fill, value }))
        : Effect.succeed<Action>(fill)),
    Match.tag('TypeAt', (typeAt) =>
      isSecretRef(typeAt.text)
        ? Effect.map(step.ledger.fill(typeAt.text), (text): Action => ({ ...typeAt, text }))
        : Effect.succeed<Action>(typeAt)),
    Match.orElse((other) => Effect.succeed(other)),
  )

const performed = (
  step: Step,
  action: Action,
): Effect.Effect<Result.Result<void, Rejection>, SecretUnavailable | AppNotOpen | AppUnreachable> =>
  step.telemetry.span(
    'e2e.engine.action',
    engineActionAttributesOf((text) => step.ledger.redact(text))(action),
    () =>
      resolvedOf(step, action).pipe(
        Effect.flatMap((resolved) => step.engine.act(resolved)),
        Effect.map(() => Result.succeed<void>(undefined)),
        Effect.catchTag(REJECTIONS, (rejected) => rejected.pipe(Result.fail, Effect.succeed)),
      ),
  )

const committed = (
  step: Step,
  recorded: RecordedAction,
  located: ActionRecord['located'],
  source: ActionEvent['source'],
) =>
  Effect.gen(function*() {
    const run = yield* Ref.get(step.run)
    yield* update(step, (current) => ({
      ...current,
      actions: [...current.actions, { action: recorded.action, located }],
      recorded: [...current.recorded, recorded],
    }))
    yield* step.onAction({
      index: run.actions.length,
      action: recorded.action,
      summary: step.ledger.redact(describeAction(recorded.action)),
      source,
    })
  })

// --- replay ------------------------------------------------------------------------------------

const replayedStepOf = (step: Step, recorded: RecordedAction) =>
  Effect.gen(function*() {
    const before = yield* step.engine.observe
    const outcome = yield* performed(step, recorded.action)
    yield* Result.match(outcome, {
      onFailure: () => Effect.void,
      onSuccess: () =>
        Effect.andThen(settled(step.engine), committed(step, recorded, [], 'replay')).pipe(
          Effect.andThen(update(step, (run) => ({ ...run, replayed: [...run.replayed, recorded.action] }))),
        ),
    })
    return Result.match(outcome, {
      onFailure: (rejected): ReplayStep => ({
        observation: before,
        outcome: { _tag: 'Rejected', code: rejected._tag },
      }),
      onSuccess: (): ReplayStep => ({ observation: before, outcome: { _tag: 'Performed' } }),
    })
  })

const replayFrom = (
  step: Step,
  actions: ReadonlyArray<RecordedAction>,
  index: number,
): Effect.Effect<ReadonlyArray<ReplayStep>, SecretUnavailable | AppNotOpen | AppUnreachable> =>
  Option.match(Arr.get(actions, index), {
    onNone: () => Effect.succeed([]),
    onSome: (recorded) =>
      Effect.flatMap(replayedStepOf(step, recorded), (replayed) =>
        Match.valueTags(replayed.outcome, {
          Performed: () => Effect.map(replayFrom(step, actions, index + 1), (rest) => [replayed, ...rest]),
          Rejected: () => Effect.succeed([replayed]),
          NotRun: () => Effect.succeed([replayed]),
        })),
  })

const replayLookupOf = (decision: ReplayDecision): CacheLookup =>
  Match.valueTags(decision, {
    Miss: (): CacheLookup => ({ _tag: 'Missed' }),
    Replayed: (): CacheLookup => ({ _tag: 'Replayed' }),
    HandOff: ({ reason }): CacheLookup => ({ _tag: 'HandedOff', reason: reason._tag }),
  })

const replayedSummaryOf = (step: Step, actions: ReadonlyArray<RecordedAction>): string =>
  step.ledger.redact(`replayed ${actions.map((recorded) => describeAction(recorded.action)).join(', ')}`)

const stopReasonOf = (decision: ReplayDecision): string =>
  Match.valueTags(decision, {
    Miss: () => 'none',
    Replayed: () => 'none',
    HandOff: ({ reason }) => reason._tag,
  })

/** Replays a recording; `Some` is the finished step, `None` hands the step to the live loop. */
const replayed = (step: Step, keying: Keying, stored: TraceEntry, entry: TraceEntry, start: Observation) =>
  step.telemetry.span(
    'e2e.replay',
    { 'e2e.replay.recorded_actions': entry.actions.length },
    (span) =>
      Effect.gen(function*() {
        const steps = yield* replayFrom(step, entry.actions, 0)
        const end = yield* settled(step.engine)
        const decision = decided(
          classifyReplay(
            new ClassifyReplay({ mode: step.context.cache.mode, entry, transcript: { start, steps, end, alerts: [] } }),
          ),
        )
        const lookup = replayLookupOf(decision)
        yield* annotated(span)({
          'e2e.cache.outcome': cacheOutcomeOf(lookup),
          'e2e.replay.stop_reason': stopReasonOf(decision),
        })
        yield* update(step, (run) => ({ ...run, lookup, existing: Option.some(stored) }))
        return Match.valueTags(decision, {
          Replayed: (): Option.Option<Finished> =>
            Option.some({ summary: replayedSummaryOf(step, entry.actions), end }),
          HandOff: (): Option.Option<Finished> => Option.none(),
          Miss: (): Option.Option<Finished> => Option.none(),
        })
      }),
  )

const missed = (step: Step): Effect.Effect<Option.Option<Finished>> =>
  Effect.as(update(step, (run) => ({ ...run, lookup: { _tag: 'Missed' } })), Option.none<Finished>())

const uniqueValuesOf = (params: StepParams): ReadonlyArray<string> => uniqueSlotsOf(params).map((slot) => slot.value)

const looked = (step: Step, keying: Keying, start: Observation) =>
  Effect.flatMap(step.store.read(keying.digest), (read) =>
    Match.valueTags(read, {
      Hit: ({ entry }) =>
        Option.match(expandSlots(entry, uniqueValuesOf(step.params)), {
          onNone: () => missed(step),
          onSome: (expanded) => replayed(step, keying, entry, expanded, start),
        }),
      Miss: () => missed(step),
      Invalid: () => missed(step),
    }))

const keyingOf = (step: Step): Option.Option<Keying> => {
  const { cache, agent } = step.context
  const decision = decided(
    deriveKey(
      new DeriveKey({
        mode: cache.mode,
        step: 'act',
        project: cache.project,
        test: cache.test,
        target: cache.target,
        engine: cache.engine,
        engineVersion: cache.engineVersion,
        app: cache.app,
        instruction: step.instruction,
        params: step.params,
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

// --- live loop ---------------------------------------------------------------------------------

const requestOf = (step: Step, run: Run, observation: Observation): ModelRequest => {
  const { config } = step.context.agent
  const messages: ReadonlyArray<Message> = [
    taskMessageOf({
      context: config.context,
      instruction: step.instruction,
      params: step.params,
      replayed: run.replayed,
    }),
    ...run.history,
    observationMessageOf(formatObservation(observation, step.ledger.redactCut), run.screenshot),
  ]
  return redactRequest(step.ledger.redact)(actRequestOf({
    model: config.model.model,
    system: systemPromptOf(config.system),
    messages,
    tools: actTools(step.engine.capabilities),
  }))
}

const metered = (response: ModelResponse) => (run: Run): Run => ({
  ...run,
  modelCalls: run.modelCalls + 1,
  tokens: { input: run.tokens.input + response.usage.input, output: run.tokens.output + response.usage.output },
  served: Option.some(response.served),
  screenshot: Option.none(),
})

const firstCallIdOf = (answer: ModelAnswer): string =>
  Match.valueTags(answer, { ToolCalls: ({ calls }) => calls[0].id, Text: () => '' })

const replied = (step: Step, answer: ModelAnswer, reply: ReadonlyArray<Message>): Effect.Effect<void> =>
  update(step, (run) => ({
    ...run,
    history: [
      ...run.history,
      ...reply.map(redactMessage(step.ledger.redact)),
      ...skippedRepliesOf(answer, firstCallIdOf(answer)),
    ],
  }))

const rejectionTextOf = (step: Step, action: Action, rejected: Rejection): string =>
  step.ledger.redact(`could not ${describeAction(action)}: ${rejected.message}`)

const executed = (step: Step, execute: Execute, answer: ModelAnswer) =>
  Effect.gen(function*() {
    const outcome = yield* performed(step, execute.action)
    yield* update(step, (run) => ({ ...run, steps: run.steps + 1 }))
    const observation = yield* settled(step.engine)
    yield* Result.match(outcome, {
      onFailure: (rejected) =>
        replied(step, answer, [toolResultOf(execute.callId, rejectionTextOf(step, execute.action, rejected))]),
      onSuccess: () =>
        Effect.andThen(
          committed(step, { action: execute.action, controls: execute.controls }, execute.located, 'model'),
          replied(step, answer, [toolResultOf(execute.callId, `done: ${describeAction(execute.action)}`)]),
        ),
    })
    return observation
  })

const captured = (step: Step, capture: Capture, answer: ModelAnswer) =>
  Effect.gen(function*() {
    const bytes = yield* step.ledger.screenshot(step.engine.screenshot({ mask: [] }))
    yield* update(step, (run) => ({ ...run, screenshot: Option.some(Base64.encode(bytes)) }))
    yield* replied(step, answer, [
      toolResultOf(capture.callId, 'the screenshot is attached to the next screen message'),
    ])
  })

const exhaustedOf = (step: Step, budget: 'steps' | 'model-calls'): StepBudgetExhausted =>
  new StepBudgetExhausted({
    message: budget === 'steps'
      ? `the step used all ${step.maxSteps} actions it may take without reaching its goal`
      : `the step used all ${step.maxModelCalls} model calls it may make without reaching its goal`,
    evidence: logEvidence(`budget ${budget}`),
  })

const unsupportedOf = (capability: string): UnsupportedCapability =>
  new UnsupportedCapability({
    message:
      `the model asked for an action that needs the ${capability} capability, which this engine does not declare`,
    evidence: logEvidence(`capability ${capability}`),
  })

const decisionOf = (step: Step, run: Run, answer: ModelAnswer, observation: Observation): NextActDecision =>
  decided(
    nextAct(
      new NextAct({
        answer,
        observation,
        capabilities: step.engine.capabilities,
        secrets: step.secrets,
        steps: run.steps,
        maxSteps: step.maxSteps,
        modelCalls: run.modelCalls,
        maxModelCalls: step.maxModelCalls,
      }),
    ),
  )

const turn = (step: Step, observation: Observation): Effect.Effect<Finished, ActFailure> =>
  Effect.gen(function*() {
    const before = yield* Ref.get(step.run)
    const response = yield* step.gateway.complete(requestOf(step, before, observation))
    yield* update(step, metered(response))
    const answer = response.answer
    yield* update(step, (run) => ({ ...run, history: [...run.history, assistantMessageOf(answer)] }))
    const decision = decisionOf(step, yield* Ref.get(step.run), answer, observation)
    return yield* Match.valueTags(decision, {
      Done: ({ summary }): Effect.Effect<Finished, ActFailure> => Effect.succeed({ summary, end: observation }),
      Execute: (execute) => Effect.flatMap(executed(step, execute, answer), (next) => turn(step, next)),
      Capture: (capture) => Effect.andThen(captured(step, capture, answer), turn(step, observation)),
      Correct: ({ reply }) => Effect.andThen(replied(step, answer, [reply]), turn(step, observation)),
      Exhausted: ({ budget }) => Effect.fail(exhaustedOf(step, budget)),
      Unsupported: ({ capability }) => Effect.fail(unsupportedOf(capability)),
    })
  })

// --- recording ---------------------------------------------------------------------------------

const servedOf = (run: Run): ModelRef => Option.getOrElse(run.served, () => ({ provider: 'none', model: 'none' }))

const stagedOf = (keying: Keying, stepIndex: number, run: Run, entry: TraceEntry): StagedRecording =>
  Option.match(run.existing, {
    onNone: (): StagedRecording => ({ stepIndex, digest: keying.digest, recording: { _tag: 'Write', entry } }),
    onSome: (existing): StagedRecording => ({
      stepIndex,
      digest: keying.digest,
      recording: { _tag: 'Overwrite', entry, existing },
    }),
  })

const templatedOf = (step: Step, entry: TraceEntry): Option.Option<TraceEntry> =>
  Match.valueTags(decided(templateUniqueSlots(new TemplateUniqueSlots({ params: step.params, entry }))), {
    Templated: (templated) => mapFlowText(templated.entry, (text) => Option.some(step.ledger.redact(text))),
    NotRecorded: () => Option.none(),
  })

const liveStagedOf = (step: Step, keying: Keying, run: Run, start: Observation, end: Observation) => {
  const { context } = step
  const flow = decided(
    recordedFlow(
      new RecordFlow({
        keyedBy: keying.context,
        start,
        end,
        actions: run.recorded,
        provenance: {
          engine: context.cache.engine,
          engineVersion: context.cache.engineVersion,
          model: servedOf(run),
          agent: context.agent.name,
          version: context.cache.version,
        },
      }),
    ),
  )
  return Match.valueTags(flow, {
    Recorded: ({ entry }) =>
      Option.map(templatedOf(step, entry), (templated) => stagedOf(keying, context.stepIndex, run, templated)),
    NotRecordable: () => Option.none<StagedRecording>(),
  })
}

const stagedAfter = (step: Step, keying: Option.Option<Keying>, run: Run, start: Observation, end: Observation) =>
  Option.flatMap(keying, (keyed) =>
    Match.valueTags(run.lookup, {
      Replayed: () =>
        Option.some<StagedRecording>({
          stepIndex: step.context.stepIndex,
          digest: keyed.digest,
          recording: { _tag: 'Keep' },
        }),
      HandedOff: () => liveStagedOf(step, keyed, run, start, end),
      Missed: () => liveStagedOf(step, keyed, run, start, end),
      Off: () => Option.none<StagedRecording>(),
    }))

const begun = (
  step: Step,
  keying: Option.Option<Keying>,
  start: Observation,
): Effect.Effect<Option.Option<Finished>, SecretUnavailable | AppNotOpen | AppUnreachable> =>
  Option.match(keying, {
    onNone: () => Effect.succeedNone,
    onSome: (keyed) => looked(step, keyed, start),
  })

const stepped = (step: Step): Effect.Effect<ActResult, ActFailure> =>
  Effect.gen(function*() {
    yield* step.ledger.require(step.secrets)
    const start = yield* settled(step.engine)
    const keying = keyingOf(step)
    const replay = yield* begun(step, keying, start)
    const current = yield* step.engine.observe
    const finished = yield* Option.match(replay, {
      onNone: () => turn(step, current),
      onSome: (done) => Effect.succeed(done),
    })
    const summary = step.ledger.redact(finished.summary)
    const run = yield* Ref.get(step.run)
    yield* update(
      step,
      (latest) => ({ ...latest, summary, staged: stagedAfter(step, keying, run, start, finished.end) }),
    )
    return { summary, cache: run.lookup, modelCalls: run.modelCalls, actions: run.actions }
  })

const outcomeOfError = (error: ActFailure): StepOutcome => {
  const code: FailureCode = error._tag
  return { _tag: 'Failed', code, cause: failureClassOf(code).cause, evidence: error.evidence }
}

const DIED: StepOutcome = {
  _tag: 'Failed',
  code: 'INTERNAL_ERROR',
  cause: failureClassOf('INTERNAL_ERROR').cause,
  evidence: logEvidence('the act step died'),
}

const outcomeOf = (exit: Exit.Exit<ActResult, ActFailure>): Option.Option<StepOutcome> =>
  Exit.match(exit, {
    onSuccess: (): Option.Option<StepOutcome> => Option.some({ _tag: 'Passed' }),
    onFailure: (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Option.none()
        : Option.some(cause.pipe(Cause.findErrorOption, Option.match({ onNone: () => DIED, onSome: outcomeOfError }))),
  })

const recordOf = (step: Step, run: Run, outcome: StepOutcome): ActRecord => ({
  stepIndex: step.context.stepIndex,
  instruction: step.instruction,
  params: step.params,
  actions: run.actions,
  summary: run.summary,
  outcome,
  lookup: run.lookup,
  modelCalls: run.modelCalls,
  tokens: run.tokens,
  staged: Match.value(outcome).pipe(
    Match.tag('Passed', () => run.staged),
    Match.orElse(() => Option.none<StagedRecording>()),
  ),
})

/** A cancelled step records nothing, so the cache is left as it was (design §9.5). */
const recorded = (step: Step, span: TelemetrySpan, exit: Exit.Exit<ActResult, ActFailure>): Effect.Effect<void> =>
  Effect.flatMap(Ref.get(step.run), (run) =>
    Effect.andThen(
      annotated(span)({
        'e2e.cache.outcome': cacheOutcomeOf(run.lookup),
        'e2e.model.calls': run.modelCalls,
        'e2e.tokens.input': run.tokens.input,
        'e2e.tokens.output': run.tokens.output,
      }),
      Option.match(outcomeOf(exit), {
        onNone: () => Effect.void,
        onSome: (outcome) =>
          Effect.andThen(counted(step.telemetry)(run), step.context.record(recordOf(step, run, outcome))),
      }),
    ))

const timedOut = (step: Step): StepTimeout =>
  new StepTimeout({
    message: `the step did not reach its goal within ${Duration.toMillis(step.timeout)} ms`,
    evidence: logEvidence(`timeout ${Duration.toMillis(step.timeout)} ms`),
  })

const NO_EVENTS = (): Effect.Effect<void> => Effect.void

const orDefault = <A>(value: A | undefined, fallback: A): A => value ?? fallback

const stepOf = (request: ActRequest) =>
  Effect.gen(function*() {
    const { context } = request
    const params = orDefault(request.params, {})
    const telemetry = yield* Telemetry
    return {
      context,
      instruction: request.instruction,
      params,
      secrets: secretNamesOf(params),
      maxSteps: orDefault(request.maxSteps, context.agent.config.maxSteps),
      maxModelCalls: orDefault(request.maxModelCalls, context.agent.config.maxModelCalls),
      timeout: Duration.fromInputUnsafe(orDefault(request.timeout, context.timeout)),
      onAction: orDefault(request.onAction, NO_EVENTS),
      engine: yield* Engine,
      gateway: spannedGateway(telemetry)(yield* ModelGateway),
      store: yield* CacheStore,
      ledger: yield* SecretLedger,
      telemetry,
      run: yield* Ref.make(FRESH_RUN),
    } satisfies Step
  })

/**
 * Drives the agent toward `instruction`: replays a recorded flow first, then asks the model one action at a
 * time until it reports the goal done, within the step's action, model-call and time budgets (design §8.1).
 */
export const act = (
  request: ActRequest,
): Effect.Effect<ActResult, ActFailure, Engine | ModelGateway | CacheStore | SecretLedger> =>
  Effect.flatMap(
    stepOf(request),
    (step) =>
      step.telemetry.span('e2e.act', stepAttributesOf(step.context), (span) =>
        stepped(step).pipe(
          Effect.timeoutOrElse({ duration: step.timeout, orElse: () => Effect.fail(timedOut(step)) }),
          Effect.onExit((exit) => recorded(step, span, exit)),
        )),
  )

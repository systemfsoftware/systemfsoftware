import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Scope from 'effect/Scope'
import * as SynchronizedRef from 'effect/SynchronizedRef'

import { act, type ActFailure, type ActRecord, type ActRequest, type ActResult } from '../agent/act.js'
import { assert, type AssertFailure, type AssertRequest, type AssertResult } from '../agent/assert.js'
import {
  extract,
  type ExtractFailure,
  type ExtractRecord,
  type ExtractRequest,
  type ExtractResult,
} from '../agent/extract.js'
import type { JudgmentRecord } from '../agent/judgment.js'
import { SecretLedger, type SecretLedgerShape } from '../agent/secret-ledger.service.js'
import { waitFor, type WaitForFailure, type WaitForRequest, type WaitForResult } from '../agent/wait-for.js'
import { CacheStore, type CacheStoreShape } from '../cache/cache-store.service.js'
import type { EngineIdentity } from '../cache/key.schema.js'
import type { AgentConfig, E2EConfig, Target } from '../Config/config.schema.js'
import { Engine, type EngineShape } from '../engine/engine.service.js'
import { ModelGateway, type ModelGatewayShape } from '../model/model.service.js'
import type { ArtifactRef, Attempt, RanAttempt } from '../report/report.schema.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import type { AppUnreachable, EnvironmentUnavailable, FailureRecord } from '../verdict/failure.schema.js'
import { StepId, type StepRecord } from '../verdict/step-record.schema.js'
import { AdmitAiTrace, admitAiTrace, type AiTraceAdmission } from './admit-ai-trace.workflow.js'
import { AdmitEvidence, admitEvidence, type EvidenceAdmission } from './admit-evidence.workflow.js'
import type { ModelCall } from './ai-trace.schema.js'
import { ArtifactStore, type ArtifactStoreShape } from './artifact-store.service.js'
import { type AttemptLog, type AttemptTest, settleAttempt, withEvidenceFailures } from './attempt.js'
import {
  captureScreen,
  type EvidenceOwner,
  NOTHING_WRITTEN,
  writeAiTrace,
  writeEvidence,
  type WrittenEvidence,
} from './capture-evidence.js'
import {
  ConcludeAttempt,
  concludeAttempt,
  type Launch,
  type LaunchKind,
  type SessionRecord,
  type TryEnding,
} from './conclude-attempt.workflow.js'
import { recordModelCalls } from './record-model-calls.js'

/** How the composition root opens the target's engine; the session calls `acquire` at most once per try. */
export interface EngineSource {
  readonly identity: EngineIdentity
  readonly version: string
  readonly acquire: Effect.Effect<EngineShape, EnvironmentUnavailable>
}

export interface SessionAgent {
  readonly name: string
  readonly config: AgentConfig
}

/** Everything one try of one test is built from (design §6.2). */
export interface SessionInput {
  readonly config: E2EConfig
  readonly target: Target
  readonly agent: SessionAgent
  readonly test: AttemptTest
  readonly retry: number
  readonly secrets: Readonly<Record<string, Redacted.Redacted<string>>>
  readonly engine: EngineSource
  /** The framework version a recording names in its provenance. */
  readonly version: string
  readonly log: AttemptLog
}

/** A started step; the try fails `STEP_NOT_AWAITED` unless `join` is run and the step finished before the end. */
export interface StepHandle<A, E> {
  readonly join: Effect.Effect<A, E>
}

export type SessionActRequest = Omit<ActRequest, 'context'>
export type SessionAssertRequest = Omit<AssertRequest, 'context'>
export type SessionWaitForRequest = Omit<WaitForRequest, 'context'>
export type SessionExtractRequest<I, O> = Omit<ExtractRequest<I, O>, 'context'>

export interface TestSessionShape {
  readonly input: SessionInput
  /** The engine, opened on first use; reading the screen counts as using it. */
  readonly screen: Effect.Effect<EngineShape, EnvironmentUnavailable>
  readonly open: (path: string) => Effect.Effect<StepHandle<void, AppUnreachable | EnvironmentUnavailable>>
  readonly act: (
    request: SessionActRequest,
  ) => Effect.Effect<StepHandle<ActResult, ActFailure | EnvironmentUnavailable>>
  readonly assert: (
    request: SessionAssertRequest,
  ) => Effect.Effect<StepHandle<AssertResult, AssertFailure | EnvironmentUnavailable>>
  readonly waitFor: (
    request: SessionWaitForRequest,
  ) => Effect.Effect<StepHandle<WaitForResult, WaitForFailure | EnvironmentUnavailable>>
  readonly extract: <I, O>(
    request: SessionExtractRequest<I, O>,
  ) => Effect.Effect<StepHandle<ExtractResult<O>, ExtractFailure | EnvironmentUnavailable>>
  /**
   * Ends the try: interrupts steps still running, settles and writes the cache, captures the screen when the
   * `trace` setting admits evidence for the try's status, closes the engine, writes `ai-trace.json` when ai-trace is
   * on and the try did not pass, writes the evidence, and appends the attempt with its artifacts to the log. Runs
   * uninterruptibly, so every ending reaches the cache decision.
   */
  readonly endAttempt: (ending: TryEnding) => Effect.Effect<Attempt>
}

/** `None` until first use; then the opened engine, or the failure every later use answers with. */
type EngineCell = Option.Option<Result.Result<EngineShape, EnvironmentUnavailable>>

type Engaged = readonly [Result.Result<EngineShape, EnvironmentUnavailable>, EngineCell]

interface Books {
  readonly input: SessionInput
  readonly gateway: ModelGatewayShape
  readonly store: CacheStoreShape
  readonly artifacts: ArtifactStoreShape
  readonly ledger: SecretLedgerShape
  readonly cell: SynchronizedRef.SynchronizedRef<EngineCell>
  readonly launches: Ref.Ref<ReadonlyArray<Launch>>
  readonly records: Ref.Ref<ReadonlyArray<SessionRecord>>
  readonly errors: Ref.Ref<ReadonlyArray<FailureRecord>>
  readonly counter: Ref.Ref<number>
  /** Every model call the try's steps made; filled only when the config turns ai-trace on. */
  readonly calls: Ref.Ref<ReadonlyArray<ModelCall>>
  readonly steps: Scope.Closeable
}

const failureRecordOf = (error: AppUnreachable | EnvironmentUnavailable): FailureRecord => ({
  code: error._tag,
  cause: failureClassOf(error._tag).cause,
  evidence: error.evidence,
})

const noted = (books: Books) => (error: AppUnreachable | EnvironmentUnavailable): Effect.Effect<void> =>
  Ref.update(books.errors, (all) => [...all, failureRecordOf(error)])

const acquired = (books: Books): Effect.Effect<Engaged> =>
  Effect.map(
    Effect.result(Effect.tapError(books.input.engine.acquire, noted(books))),
    (outcome): Engaged => [outcome, Option.some(outcome)],
  )

const engaged = (books: Books) => (cell: EngineCell): Effect.Effect<Engaged> =>
  Option.match(cell, {
    onNone: () => acquired(books),
    onSome: (outcome) => Effect.succeed<Engaged>([outcome, cell]),
  })

const engineOf = (books: Books): Effect.Effect<EngineShape, EnvironmentUnavailable> =>
  Effect.flatMap(SynchronizedRef.modifyEffect(books.cell, engaged(books)), Effect.fromResult)

const closed = (cell: EngineCell): Effect.Effect<EngineCell> =>
  Option.match(cell, {
    onNone: () => Effect.succeed(cell),
    onSome: Result.match({
      onSuccess: (engine) => Effect.as(engine.close, Option.none()),
      onFailure: () => Effect.succeed(cell),
    }),
  })

const closeEngine = (books: Books): Effect.Effect<void> => SynchronizedRef.updateEffect(books.cell, closed)

const marked = (index: number, field: 'joined' | 'settled') => (all: ReadonlyArray<Launch>): ReadonlyArray<Launch> =>
  all.map((launch) => (launch.index === index ? { ...launch, [field]: true } : launch))

const stepIdOf = (index: number): StepId => StepId.make(`step-${index + 1}`)

const recorded = (books: Books, index: number) =>
(
  step: StepRecord,
  staged: SessionRecord['staged'],
): Effect.Effect<void> => Ref.update(books.records, (all) => [...all, { index, step, staged }])

const launched = <A, E>(
  books: Books,
  kind: LaunchKind,
  text: string,
  step: (index: number) => Effect.Effect<A, E>,
): Effect.Effect<StepHandle<A, E>> =>
  Effect.gen(function*() {
    const index = yield* Ref.getAndUpdate(books.counter, (next) => next + 1)
    yield* Ref.update(books.launches, (all) => [
      ...all,
      { index, kind, text: books.ledger.redact(text), joined: false, settled: false },
    ])
    const fiber = yield* step(index).pipe(
      Effect.onExit(() => Ref.update(books.launches, marked(index, 'settled'))),
      Effect.forkIn(books.steps),
    )
    return { join: Effect.andThen(Ref.update(books.launches, marked(index, 'joined')), Fiber.join(fiber)) }
  })

const contextOf = (books: Books, index: number) => ({
  stepIndex: index,
  agent: books.input.agent,
  cache: {
    mode: books.input.config.cache.mode,
    project: books.input.config.projectId,
    test: books.input.test.id,
    target: books.input.target.name,
    engine: books.input.engine.identity,
    engineVersion: books.input.engine.version,
    app: books.input.target.app.identity,
    version: books.input.version,
  },
  timeout: books.input.config.timeout,
})

const gatewayOf = (books: Books, index: number): ModelGatewayShape =>
  books.input.config.aiTrace ? recordModelCalls(books.calls, stepIdOf(index))(books.gateway) : books.gateway

const withServices = (books: Books, index: number) =>
<A, E>(
  step: Effect.Effect<A, E, Engine | ModelGateway | CacheStore | SecretLedger>,
): Effect.Effect<A, E | EnvironmentUnavailable> =>
  Effect.flatMap(engineOf(books), (engine) =>
    step.pipe(
      Effect.provideService(Engine, engine),
      Effect.provideService(ModelGateway, gatewayOf(books, index)),
      Effect.provideService(CacheStore, books.store),
      Effect.provideService(SecretLedger, books.ledger),
    ))

const actRecorder = (books: Books, index: number) => (record: ActRecord): Effect.Effect<void> =>
  recorded(books, index)({
    _tag: 'ActStep',
    id: stepIdOf(index),
    instruction: record.instruction,
    params: record.params,
    actions: record.actions,
    summary: record.summary,
    outcome: record.outcome,
    cache: { lookup: record.lookup, write: 'no-change' },
    modelCalls: record.modelCalls,
    tokens: record.tokens,
  }, record.staged)

const judgedStepFields = (index: number, record: JudgmentRecord) => ({
  id: stepIdOf(index),
  record: record.record,
  outcome: record.outcome,
  cache: { lookup: record.lookup, write: 'no-change' as const },
  modelCalls: record.modelCalls,
  tokens: record.tokens,
})

const assertRecorder = (books: Books, index: number) => (record: JudgmentRecord): Effect.Effect<void> =>
  recorded(books, index)({ _tag: 'AssertStep', ...judgedStepFields(index, record) }, record.staged)

const waitForRecorder = (books: Books, index: number) => (record: JudgmentRecord): Effect.Effect<void> =>
  recorded(books, index)({ _tag: 'WaitForStep', ...judgedStepFields(index, record) }, record.staged)

const extractRecorder = (books: Books, index: number) => (record: ExtractRecord): Effect.Effect<void> =>
  recorded(books, index)(
    {
      _tag: 'ExtractStep',
      id: stepIdOf(index),
      schemaId: record.schemaId,
      result: record.value,
      outcome: record.outcome,
      cache: { lookup: { _tag: 'Off' }, write: 'no-change' },
      modelCalls: record.modelCalls,
      tokens: record.tokens,
    },
    Option.none(),
  )

const opened = (books: Books, path: string): Effect.Effect<void, AppUnreachable | EnvironmentUnavailable> =>
  Effect.flatMap(
    engineOf(books),
    (engine) => Effect.tapError(engine.open(new URL(path, books.input.target.app.url).href), noted(books)),
  )

interface Evidenced {
  readonly attempt: RanAttempt
  readonly artifacts: ReadonlyArray<ArtifactRef>
}

const admissionOf = (books: Books, attempt: RanAttempt): EvidenceAdmission =>
  Result.match(admitEvidence(new AdmitEvidence({ trace: books.input.config.trace, status: attempt.status })), {
    onFailure: (missing: never) => missing,
    onSuccess: (admission) => admission,
  })

const aiTraceAdmissionOf = (books: Books, attempt: RanAttempt): AiTraceAdmission =>
  Result.match(admitAiTrace(new AdmitAiTrace({ aiTrace: books.input.config.aiTrace, status: attempt.status })), {
    onFailure: (missing: never) => missing,
    onSuccess: (admission) => admission,
  })

const ownerOf = (books: Books): EvidenceOwner => ({
  store: books.artifacts,
  ledger: books.ledger,
  test: books.input.test,
  target: books.input.target.name,
  agent: books.input.agent.name,
})

const aiTraced = (books: Books, attempt: RanAttempt): Effect.Effect<WrittenEvidence> =>
  Match.valueTags(aiTraceAdmissionOf(books, attempt), {
    AiTraceAdmitted: () =>
      Effect.flatMap(
        Ref.get(books.calls),
        (calls) => writeAiTrace({ ...ownerOf(books), retry: books.input.retry, calls }),
      ),
    AiTraceDeclined: () => Effect.succeed(NOTHING_WRITTEN),
  })

const evidencedWith = (attempt: RanAttempt, written: WrittenEvidence): Evidenced => ({
  attempt: withEvidenceFailures({ attempt, failures: written.failures }),
  artifacts: written.artifacts,
})

const captured = (books: Books, attempt: RanAttempt): Effect.Effect<Evidenced> =>
  Effect.gen(function*() {
    const screen = yield* captureScreen({ engine: yield* SynchronizedRef.get(books.cell), ledger: books.ledger })
    yield* closeEngine(books)
    const written = yield* aiTraced(books, attempt)
    return evidencedWith(attempt, yield* writeEvidence({ ...ownerOf(books), attempt, screen, written }))
  })

// The screen is read before the engine closes and after the cache settles, so the trace shows the settled writes.
// The ai-trace is admitted apart from the rest of the evidence and written before `trace.md`, which links it.
const evidenced = (books: Books) => (attempt: RanAttempt): Effect.Effect<Evidenced> =>
  Match.valueTags(admissionOf(books, attempt), {
    EvidenceAdmitted: () => captured(books, attempt),
    EvidenceDeclined: () =>
      Effect.andThen(
        closeEngine(books),
        Effect.map(aiTraced(books, attempt), (written) => evidencedWith(attempt, written)),
      ),
  })

const endedWith = (books: Books) => (ending: TryEnding): Effect.Effect<Attempt> =>
  Effect.uninterruptible(Effect.gen(function*() {
    const launches = yield* Ref.get(books.launches)
    yield* Scope.close(books.steps, Exit.void)
    const conclusion = concludeAttempt(
      new ConcludeAttempt({
        ending,
        launches,
        records: yield* Ref.get(books.records),
        sessionErrors: yield* Ref.get(books.errors),
      }),
    )
    const { attempt, artifacts } = yield* settleAttempt({
      retry: books.input.retry,
      mode: books.input.config.cache.mode,
      store: books.store,
      conclusion: Result.match(conclusion, { onFailure: (missing: never) => missing, onSuccess: (decided) => decided }),
    }).pipe(Effect.flatMap(evidenced(books)))
    yield* books.input.log.append({
      test: books.input.test,
      target: books.input.target.name,
      agent: books.input.agent.name,
      attempt,
      artifacts,
    })
    return attempt
  }))

const shapeOf = (books: Books): TestSessionShape => ({
  input: books.input,
  screen: engineOf(books),
  open: (path) => launched(books, 'open', path, () => opened(books, path)),
  act: (request) =>
    launched(
      books,
      'act',
      request.instruction,
      (index) =>
        withServices(books, index)(
          act({ ...request, context: { ...contextOf(books, index), record: actRecorder(books, index) } }),
        ),
    ),
  assert: (request) =>
    launched(books, 'assert', request.statement, (index) =>
      withServices(books, index)(
        assert({ ...request, context: { ...contextOf(books, index), record: assertRecorder(books, index) } }),
      )),
  waitFor: (request) =>
    launched(books, 'waitFor', request.condition, (index) =>
      withServices(books, index)(
        waitFor({ ...request, context: { ...contextOf(books, index), record: waitForRecorder(books, index) } }),
      )),
  extract: (request) =>
    launched(books, 'extract', request.instruction, (index) =>
      withServices(books, index)(
        extract({ ...request, context: { ...contextOf(books, index), record: extractRecorder(books, index) } }),
      )),
  endAttempt: endedWith(books),
})

const make = (
  input: SessionInput,
): Effect.Effect<TestSessionShape, never, Scope.Scope | ModelGateway | CacheStore | ArtifactStore> =>
  Effect.gen(function*() {
    const scope = yield* Scope.Scope
    const books: Books = {
      input,
      gateway: yield* ModelGateway,
      store: yield* CacheStore,
      artifacts: yield* ArtifactStore,
      ledger: yield* SecretLedger.make(input.secrets),
      cell: yield* SynchronizedRef.make<EngineCell>(Option.none()),
      launches: yield* Ref.make<ReadonlyArray<Launch>>([]),
      records: yield* Ref.make<ReadonlyArray<SessionRecord>>([]),
      errors: yield* Ref.make<ReadonlyArray<FailureRecord>>([]),
      counter: yield* Ref.make(0),
      calls: yield* Ref.make<ReadonlyArray<ModelCall>>([]),
      steps: yield* Effect.andThen(
        Scope.addFinalizer(scope, Effect.suspend(() => closeEngine(books))),
        Scope.fork(scope),
      ),
    }
    return shapeOf(books)
  })

/**
 * One try of one test (design §6.2-6.3): its config, target and agent, a fresh secret ledger, the engine
 * opened on first use, and every step it started. Built per try at the runner edge; closing the layer's
 * scope closes an engine the try left open and interrupts steps still running.
 */
export class TestSession extends Context.Service<TestSession, TestSessionShape>()(
  '@systemfsoftware/effect-e2e/run/TestSession',
) {
  static readonly layer = (
    input: SessionInput,
  ): Layer.Layer<TestSession, never, ModelGateway | CacheStore | ArtifactStore> => Layer.effect(this)(make(input))
}

/**
 * The in-process way to run a program the way the runner runs a lane and read back the record its failure rendered
 * (R11, KTD10): a corpus drives a fixture through this instead of spawning Vitest, and without importing `src/`.
 *
 * The run gets its own check ledger — its own `expect` — so a corpus fixture's `Then` asserts on the check it
 * answered with, not on the check the corpus test itself already spent, and its own recorder, so the record is
 * rendered from exactly the spans the run opened.
 *
 * @since 4.0.0
 */
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import type * as Tracer from 'effect/Tracer'
import type * as V from 'vitest'
import { TestRunner } from 'vitest'
import { Asserted, type Checks, checksFor, type Ledger, makeLedger } from './checks.js'
import { type FailureRecord, renderFailureRecord, type TestIdentity, testIdentityOf } from './failure-record.js'
import { type ProvidedCheckDefaults, providedCheckDefaults } from './property/defaults.js'
import type * as Engine from './property/engine.js'
import { makeProperty, type PropertyRuntime } from './property/engine.js'
import type { NonBooleanVerdict } from './property/error.schema.js'
import { replayOfFailure } from './property/replay.js'
import { providedRoot } from './provided.js'
import type { SpanRecorder } from './span-recorder.js'
import { createSpanRecorder } from './span-recorder.js'
import { VitestTestContext } from './test-context.js'

/** @internal */
export interface RecordedRun<A, E> {
  (checks: Checks): Effect.Effect<A, E, Asserted>
}

/** @internal */
export interface RecordedProperty<G extends Engine.Gens, S extends Engine.PropertySubject, N extends number> {
  readonly name: string
  readonly spec: Engine.PropertySpec<G, S, N>
  readonly holds: (subject: S, values: Engine.Values<G>) => boolean
  /** The provided budget the run supplies in place of the configured default, e.g. a derandomizing `seed`. */
  readonly budget?: ProvidedCheckDefaults | undefined
}

type PropertyProgram = (task: Engine.PropertyTask) => Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, never>

const renderRecord = <E>(
  failure: Cause.Cause<E> | E,
  spans: ReadonlyArray<Tracer.NativeSpan>,
  identity: TestIdentity,
): FailureRecord =>
  renderFailureRecord({ failure, spans, identity, replay: replayOfFailure(failure), root: providedRoot() })

const outcomeOf = <A, E>(
  exit: Exit.Exit<A, E>,
  recorder: SpanRecorder,
  identity: TestIdentity,
): FailureRecord | undefined =>
  Exit.isSuccess(exit) ? undefined : renderRecord(Cause.squash(exit.cause), recorder.spans, identity)

const provideRun = <A, E>(
  effect: Effect.Effect<A, E, Asserted>,
  ledger: Ledger,
  ctx: V.TestContext,
): Effect.Effect<A, E> =>
  effect.pipe(
    Effect.provideService(Asserted, ledger.asserted),
    Effect.provideService(VitestTestContext, ctx),
  )

const runRecorded = <A, E>(
  ctx: V.TestContext,
  program: RecordedRun<A, E>,
): Promise<FailureRecord | undefined> => {
  const ledger = makeLedger(ctx)
  const recorder = createSpanRecorder()
  return Effect.runPromiseExit(
    provideRun(program(checksFor(ledger)), ledger, ctx).pipe(Effect.withTracer(recorder.tracer)),
  ).then((exit) => outcomeOf(exit, recorder, testIdentityOf()))
}

/**
 * Runs one program as the runner runs a lane, with a fresh ledger and its own recorder, and resolves with the
 * record its failure rendered — or `undefined` when it passed.
 *
 * @internal
 */
export const recordOfRun = <A, E>(program: RecordedRun<A, E>): Promise<FailureRecord | undefined> => {
  const task = TestRunner.getCurrentTest()
  if (task === undefined) return Promise.resolve(undefined)
  return runRecorded(task.context, program)
}

interface CapturedProperty {
  readonly name: string
  readonly program: PropertyProgram
}

const capturingRuntime = (captured: Array<CapturedProperty>): PropertyRuntime<never> => ({
  register: (name, program) => {
    captured.push({ name, program })
  },
  provide: (effect) => effect,
})

const filepathOf = (current: V.TestContext['task'] | undefined): string =>
  current === undefined ? '' : current.file.filepath

const taskOfRecorded = (name: string, budget: ProvidedCheckDefaults | undefined): Engine.PropertyTask => {
  const current = TestRunner.getCurrentTest()
  return {
    identity: { ...testIdentityOf(current), name },
    filepath: filepathOf(current),
    budget: budget ?? providedCheckDefaults(),
  }
}

/**
 * Runs one property the way the runner runs `it.prop`, with a fresh ledger and its own recorder, and resolves with
 * the record its falsification rendered — or `undefined` when it held.
 *
 * @internal
 */
export const recordOfProperty = <
  const G extends Engine.Gens,
  S extends Engine.PropertySubject,
  N extends number,
>(
  input: RecordedProperty<G, S, N>,
): Promise<FailureRecord | undefined> => {
  const captured: Array<CapturedProperty> = []
  makeProperty(capturingRuntime(captured)).prop(input.name, input.spec, input.holds)
  const entry = Option.getOrThrow(Option.fromNullishOr(captured[0]))
  const task = taskOfRecorded(entry.name, input.budget)
  return recordOfRun(() => entry.program(task))
}

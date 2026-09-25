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
import type { NonBooleanVerdict } from './errors.schema.js'
import { testIdentityOf } from './failure-identity.js'
import { type FailureRecord, renderFailureRecord, type TestIdentity } from './failure-record.js'
import type * as Engine from './property/engine.js'
import { makeProperty, type PropertyRuntime } from './property/engine.js'
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
}

type PropertyProgram = () => Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, never>

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
  return Effect.runPromiseExit(provideRun(program(checksFor(ledger)), ledger, ctx)).then((exit) =>
    outcomeOf(exit, recorder, testIdentityOf())
  )
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

const capturingRuntime = (programs: Array<PropertyProgram>): PropertyRuntime<never> => ({
  register: (_name, program) => {
    programs.push(program)
  },
  provide: (effect) => effect,
})

const capturedProgram = (programs: ReadonlyArray<PropertyProgram>): PropertyProgram =>
  Option.getOrThrow(Option.fromNullishOr(programs[0]))

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
  const programs: Array<PropertyProgram> = []
  makeProperty(capturingRuntime(programs)).prop(input.name, input.spec, input.holds)
  return recordOfRun(capturedProgram(programs))
}

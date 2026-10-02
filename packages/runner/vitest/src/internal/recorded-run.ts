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
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import type * as Tracer from 'effect/Tracer'
import type * as V from 'vitest'
import { TestRunner } from 'vitest'
import { Asserted, type Checks, checksFor, type Ledger, makeLedger } from './checks.js'
import { type FailureRecord, renderFailureRecord, type TestIdentity, testIdentityOf } from './failure-record.js'
import { type ProvidedCheckDefaults, providedCheckDefaults } from './property/defaults.js'
import type * as Engine from './property/engine.js'
import { makeProperty, type PropApi, type PropertyRuntime } from './property/engine.js'
import type { NonBooleanVerdict, VacuousProperty } from './property/error.schema.js'
import { type FileLedger, makeFileLedger } from './property/impostor.js'
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
  /** The path of the test file whose seed store to read and write; absent, the run keeps no store. */
  readonly store?: string | undefined
}

type PropertyProgram = (task: Engine.PropertyTask) => Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, never>

const renderRecord = <E>(
  failure: Cause.Cause<E> | E,
  spans: ReadonlyArray<Tracer.NativeSpan>,
  identity: TestIdentity,
): FailureRecord => renderFailureRecord({ failure, spans, identity, replay: undefined, root: providedRoot() })

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

/** @internal */
export interface RecordedFile {
  readonly records: ReadonlyArray<FailureRecord | undefined>
  readonly vacuous: VacuousProperty | undefined
}

const capturingRuntime = (captured: Array<CapturedProperty>, ledger: FileLedger): PropertyRuntime<never> => ({
  register: (name, program) => {
    captured.push({ name, program })
  },
  provide: (effect) => effect,
  ledger,
})

const taskOfRecorded = (
  name: string,
  budget: ProvidedCheckDefaults | undefined,
  store: string | undefined,
): Engine.PropertyTask => {
  const current = TestRunner.getCurrentTest()
  return {
    identity: { ...testIdentityOf(current), name },
    filepath: Option.getOrNull(Option.fromNullishOr(store)),
    budget: budget ?? providedCheckDefaults(),
  }
}

/** Runs every captured program in registration order, each as `recordOfProperty` runs one. */
const runCaptured = (
  captured: ReadonlyArray<CapturedProperty>,
  budget: ProvidedCheckDefaults | undefined,
  store: string | undefined,
): Promise<Array<FailureRecord | undefined>> =>
  captured.reduce<Promise<Array<FailureRecord | undefined>>>(
    (previous, entry) =>
      previous.then((records) => {
        const task = taskOfRecorded(entry.name, budget, store)
        return recordOfRun(() => entry.program(task)).then((record) => [...records, record])
      }),
    Promise.resolve([]),
  )

interface CapturedFile {
  readonly records: Array<FailureRecord | undefined>
  readonly ledger: FileLedger
}

/** Registers a whole file's properties on a capturing runtime with a fresh ledger, and runs them in order. */
const capturedRun = (
  register: (api: PropApi<never>) => void,
  budget: ProvidedCheckDefaults | undefined,
  store: string | undefined,
): Promise<CapturedFile> => {
  const captured: Array<CapturedProperty> = []
  const ledger = makeFileLedger()
  register(makeProperty(capturingRuntime(captured, ledger)))
  return runCaptured(captured, budget, store).then((records) => ({ records, ledger }))
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
): Promise<FailureRecord | undefined> =>
  capturedRun((api) => api.prop(input.name, input.spec, input.holds), input.budget, input.store)
    .then(({ records }) => records[0])

interface RecordedFileOptions {
  readonly budget?: ProvidedCheckDefaults | undefined
  readonly store?: string | undefined
}

const EMPTY_FILE_OPTIONS: RecordedFileOptions = {}

/**
 * Runs every property and law a file registers, in registration order, then finalises the file's one ledger:
 * resolves with each property's rendered failure and the file's single vacuous verdict, or `undefined` when the
 * file holds. The name a property is recorded under is the name it was registered with.
 *
 * @internal
 */
export const recordOfFile: {
  (register: (api: PropApi<never>) => void, options?: RecordedFileOptions): Promise<RecordedFile>
  (options?: RecordedFileOptions): (register: (api: PropApi<never>) => void) => Promise<RecordedFile>
} = Function.dual(
  (args: IArguments): boolean => typeof args[0] === 'function',
  (register: (api: PropApi<never>) => void, options?: RecordedFileOptions): Promise<RecordedFile> => {
    const resolved = options ?? EMPTY_FILE_OPTIONS
    return capturedRun(register, resolved.budget, resolved.store).then(({ records, ledger }) => ({
      records,
      vacuous: ledger.finalise(),
    }))
  },
)

import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Duration, Effect, HashMap, Layer, Match, Option, Ref, Scope, Stream } from 'effect'
import type { ChildStep } from './ChildScript.schema.js'
import type { TraceComparison } from './compare-traces.workflow.js'
import { compare } from './compare.js'
import { ScenarioCompared, ScenarioStalled } from './ConformanceReport.schema.js'
import type { ConformanceReport, ScenarioResult } from './ConformanceReport.schema.js'
import type { ChildControl, ConformanceDriver, LaunchedChild } from './driver.js'
import { FiberReference } from './FiberReference.js'
import { observedStepsOf } from './observed-trace.js'
import type { ChildRole, Scenario } from './Scenario.schema.js'
import { Scenarios } from './Scenarios.js'
import type { ConformanceTrace } from './Trace.schema.js'

type Declaration = Supervisor.Medium.MediumDeclaration
type PortShape<Program, StartError, R> = Supervisor.Medium.MediumPortShape<Program, StartError, R>
type FiberShape = Supervisor.Medium.MediumPortShape<Supervisor.FiberProgram, never, Scope.Scope>
type Requirements<Program, StartError, R> = FiberShape | PortShape<Program, StartError, Scope.Scope | R> | R
type Trace = ReadonlyArray<Supervisor.TraceEntry>

const GRACEFUL_MILLIS = 200

const SHUTDOWN_MODES: Record<string, NonNullable<Supervisor.ChildOptions['shutdown']> | undefined> = {
  brutal: { _tag: 'Brutal' },
  graceful: { _tag: 'Graceful', millis: GRACEFUL_MILLIS },
  infinity: { _tag: 'Infinity' },
}

const holds = (conditions: ReadonlyArray<boolean>): boolean => conditions.every((condition) => condition)

const terminatedDecisionIn = (trace: Trace): boolean => Arr.some(trace, (entry) => terminatesIn(entry.decision))

const terminatesIn = (decision: Supervisor.TraceEntry['decision']): boolean =>
  Match.value(decision).pipe(
    Match.tag('Terminate', (terminate) => terminate.commands.terminates.length > 0),
    Match.orElse(() => false),
  )

const startedOf = (childId: string) => (entry: Supervisor.TraceEntry): boolean =>
  Match.value(entry.event).pipe(
    Match.tag('ChildStarted', (started) => started.childId === childId),
    Match.orElse(() => false),
  )

const generationOf = (entry: Supervisor.TraceEntry): number =>
  Match.value(entry.event).pipe(
    Match.tag('ChildStarted', (started) => started.generation),
    Match.orElse(() => 0),
  )

const currentGenerationOf = (childId: string) => (trace: Trace): number =>
  Option.getOrElse(Option.map(Arr.findLast(trace, startedOf(childId)), generationOf), () => 0)

const incarnationStartedIn = (childId: string) => (trace: Trace): boolean => Arr.some(trace, startedOf(childId))

const endingEventOf = (childId: string, generation: number) => (entry: Supervisor.TraceEntry): boolean =>
  Match.value(entry.event).pipe(
    Match.tag(
      'ChildTerminated',
      (terminated) => holds([terminated.childId === childId, terminated.generation === generation]),
    ),
    Match.tag('ChildStopped', (stopped) => holds([stopped.childId === childId, stopped.generation === generation])),
    Match.tag('ChildStarted', (started) => holds([started.childId === childId, started.generation > generation])),
    Match.orElse(() => false),
  )

const readyEventOf = (childId: string, generation: number) => (entry: Supervisor.TraceEntry): boolean =>
  Match.value(entry.event).pipe(
    Match.tag('ChildReady', (ready) => holds([ready.childId === childId, ready.generation === generation])),
    Match.orElse(() => false),
  )

const incarnationEndedIn = (childId: string, generation: number) => (trace: Trace): boolean =>
  Arr.some(trace, endingEventOf(childId, generation)) || terminatedDecisionIn(trace)

const readinessSeenIn = (childId: string, generation: number) => (trace: Trace): boolean =>
  Arr.some(trace, readyEventOf(childId, generation))

const stepSettledIn = (childId: string, generation: number, step: ChildStep['_tag']) => (trace: Trace): boolean =>
  Match.value(step).pipe(
    Match.when('BecomeReady', () => readinessSeenIn(childId, generation)(trace)),
    Match.when('ExitNormal', () => incarnationEndedIn(childId, generation)(trace)),
    Match.when('ExitAbnormal', () => incarnationEndedIn(childId, generation)(trace)),
    Match.orElse(() => true),
  )

const awaitPredicate = (
  seen: Ref.Ref<Trace>,
  predicate: (trace: Trace) => boolean,
): Effect.Effect<void> => Effect.flatMap(Ref.get(seen), (trace) => settleOf(seen, predicate, trace))

const settleOf = (
  seen: Ref.Ref<Trace>,
  predicate: (trace: Trace) => boolean,
  trace: Trace,
): Effect.Effect<void> =>
  Option.match(Option.filter(Option.some(Effect.void), () => predicate(trace)), {
    onSome: (done) => done,
    onNone: () => Effect.suspend(() => Effect.andThen(Effect.yieldNow, awaitPredicate(seen, predicate))),
  })

const shutdownModeOf = (kind: ChildRole['shutdown']): NonNullable<Supervisor.ChildOptions['shutdown']> =>
  Option.getOrThrow(Option.fromNullishOr(SHUTDOWN_MODES[kind]))

const childOptionsOf = (role: ChildRole): Supervisor.ChildOptions => ({
  restartType: role.restartType,
  shutdown: shutdownModeOf(role.shutdown),
  startTimeoutMillis: role.startTimeoutMillis,
})

const programOf = <Program>(launched: HashMap.HashMap<string, LaunchedChild<Program>>, childId: string): Program =>
  Option.getOrThrow(HashMap.get(launched, childId)).program

const controlOf = <Program>(
  launched: HashMap.HashMap<string, LaunchedChild<Program>>,
  childId: string,
): ChildControl => Option.getOrThrow(HashMap.get(launched, childId)).control

const roleOf = (scenario: Scenario, childId: string): ChildRole =>
  Option.getOrThrow(Arr.findFirst(scenario.children, (role) => role.childId === childId))

const scriptOf = (scenario: Scenario, childId: string): ChildRole['script'] => roleOf(scenario, childId).script

const launchAllOf = <Program, StartError, R>(
  driver: ConformanceDriver<Program, StartError, R>,
  scenario: Scenario,
): Effect.Effect<HashMap.HashMap<string, LaunchedChild<Program>>, never, Scope.Scope | R> =>
  Effect.map(
    Effect.forEach(
      scenario.children,
      (role) => Effect.map(driver.launch(role.childId, role.script), (child) => [role.childId, child] as const),
    ),
    HashMap.fromIterable,
  )

const supervisorOf = <Program, StartError, R>(
  driver: ConformanceDriver<Program, StartError, R>,
  scenario: Scenario,
  launched: HashMap.HashMap<string, LaunchedChild<Program>>,
): Supervisor.SupervisorSpec<PortShape<Program, StartError, Scope.Scope | R> | R> =>
  Supervisor.make(scenario.name).pipe(
    Supervisor.strategy(scenario.strategy),
    Supervisor.intensity(scenario.intensity, scenario.periodMillis),
    Supervisor.children(
      Arr.map(
        scenario.children,
        (role) =>
          Supervisor.ChildSpecs.on(driver.port)(role.childId, programOf(launched, role.childId), childOptionsOf(role)),
      ),
    ),
  )

const followedTraceOf = (handle: Supervisor.RunningSupervisor): Effect.Effect<Ref.Ref<Trace>, never, Scope.Scope> =>
  Effect.gen(function*() {
    const seen = yield* Ref.make<Trace>([])
    yield* Effect.forkScoped(
      Stream.runForEach(Supervisor.traceOf(handle), (entry) => Ref.update(seen, (trace) => Arr.append(trace, entry))),
      { startImmediately: true },
    )
    return seen
  })

const currentCursorOf = (
  cursors: Ref.Ref<HashMap.HashMap<string, number>>,
  childId: string,
): Effect.Effect<number> =>
  Effect.map(Ref.get(cursors), (known) => Option.getOrElse(HashMap.get(known, childId), () => 0))

const advanceEffectOf = <Program>(
  cursors: Ref.Ref<HashMap.HashMap<string, number>>,
  seen: Ref.Ref<Trace>,
  scenario: Scenario,
  launched: HashMap.HashMap<string, LaunchedChild<Program>>,
  childId: string,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* awaitPredicate(seen, incarnationStartedIn(childId))
    const generation = yield* Effect.map(Ref.get(seen), currentGenerationOf(childId))
    const index = yield* currentCursorOf(cursors, childId)
    yield* Ref.update(cursors, (known) => HashMap.set(known, childId, index + 1))
    yield* Option.match(Arr.get(scriptOf(scenario, childId), index), {
      onNone: () => Effect.void,
      onSome: (step) =>
        Effect.andThen(
          controlOf(launched, childId).advance(step),
          awaitPredicate(seen, stepSettledIn(childId, generation, step._tag)),
        ),
    })
  })

const controlStepEffectOf = <Program>(
  cursors: Ref.Ref<HashMap.HashMap<string, number>>,
  seen: Ref.Ref<Trace>,
  scenario: Scenario,
  launched: HashMap.HashMap<string, LaunchedChild<Program>>,
  handle: Supervisor.RunningSupervisor,
  step: Scenario['control'][number],
): Effect.Effect<void> =>
  Match.value(step).pipe(
    Match.tag('AdvanceChild', (advance) => advanceEffectOf(cursors, seen, scenario, launched, advance.childId)),
    Match.tag('ShutdownSupervisor', () => Supervisor.shutdown(handle)),
    Match.exhaustive,
  )

const driveControlOf = <Program>(
  scenario: Scenario,
  launched: HashMap.HashMap<string, LaunchedChild<Program>>,
  handle: Supervisor.RunningSupervisor,
  seen: Ref.Ref<Trace>,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const cursors = yield* Ref.make(HashMap.empty<string, number>())
    yield* Effect.forEach(
      scenario.control,
      (step) => controlStepEffectOf(cursors, seen, scenario, launched, handle, step),
      { discard: true },
    )
  })

const runScenarioOf = <Program, StartError, R>(
  driver: ConformanceDriver<Program, StartError, R>,
  scenario: Scenario,
): Effect.Effect<ConformanceTrace, never, PortShape<Program, StartError, Scope.Scope | R> | R> =>
  Effect.scoped(Effect.gen(function*() {
    const launched = yield* launchAllOf(driver, scenario)
    const handle = yield* supervisorOf(driver, scenario, launched).scoped
    const seen = yield* followedTraceOf(handle)
    yield* driveControlOf(scenario, launched, handle, seen)
    yield* awaitPredicate(seen, terminatedDecisionIn)
    const entries = yield* Ref.get(seen)
    return { scenario: scenario.name, medium: driver.name, steps: observedStepsOf(entries) }
  }))

const runReferenceOf = (scenario: Scenario): Effect.Effect<ConformanceTrace, never, FiberShape> =>
  runScenarioOf(FiberReference, scenario)

const SCENARIO_MILLIS = Duration.seconds(5)

const outcomeOf = (
  scenario: Scenario,
  medium: string,
  reference: Option.Option<ConformanceTrace>,
  candidate: Option.Option<ConformanceTrace>,
  declaration: Declaration,
): ScenarioResult =>
  Option.match(reference, {
    onNone: () => new ScenarioStalled({ scenario: scenario.name, medium }),
    onSome: (referenceTrace) =>
      Option.match(candidate, {
        onNone: () => new ScenarioStalled({ scenario: scenario.name, medium }),
        onSome: (candidateTrace) =>
          new ScenarioCompared({
            scenario: scenario.name,
            comparison: compare(referenceTrace, candidateTrace, declaration),
          }),
      }),
  })

const proveScenarioOf = <Program, StartError, R>(
  driver: ConformanceDriver<Program, StartError, R>,
  scenario: Scenario,
): Effect.Effect<
  ScenarioResult,
  never,
  FiberShape | PortShape<Program, StartError, Scope.Scope | R> | R
> =>
  Effect.map(
    Effect.zip(
      Effect.timeoutOption(runReferenceOf(scenario), SCENARIO_MILLIS),
      Effect.timeoutOption(runScenarioOf(driver, scenario), SCENARIO_MILLIS),
    ),
    ([reference, candidate]) => outcomeOf(scenario, driver.name, reference, candidate, driver.declaration),
  )

const comparisonConforms = (comparison: TraceComparison): boolean =>
  Match.value(comparison).pipe(
    Match.tag('TracesConform', () => true),
    Match.orElse(() => false),
  )

const resultConforms = (result: ScenarioResult): boolean =>
  Match.value(result).pipe(
    Match.tag('ScenarioCompared', (compared) => comparisonConforms(compared.comparison)),
    Match.orElse(() => false),
  )

/**
 * Proves a medium against the fiber reference: runs the whole scenario
 * catalogue on both and compares every pair within the driver's declaration.
 * The report never fails — a divergence is data naming the scenario, the medium
 * and the first diverging index, and a scenario that never finished is a
 * `ScenarioStalled` naming the same two.
 */
export const prove = <Program, StartError, R>(
  driver: ConformanceDriver<Program, StartError, R>,
): Effect.Effect<ConformanceReport, never, Requirements<Program, StartError, R>> =>
  Effect.map(
    Effect.forEach(Scenarios, (scenario) => proveScenarioOf(driver, scenario)),
    (results) => ({
      medium: driver.name,
      declaration: driver.declaration,
      results,
    }),
  )

/** Whether every scenario in the report ran to a conforming comparison. */
export const isConforming = (report: ConformanceReport): boolean => Arr.every(report.results, resultConforms)

/** The fiber medium bound to its port, so a caller can provide the reference's own service. */
export const FiberReferenceLayer: Layer.Layer<FiberShape> = Layer.succeed(Supervisor.FiberMedium.fiberPort, {
  medium: Supervisor.FiberMedium.medium,
})

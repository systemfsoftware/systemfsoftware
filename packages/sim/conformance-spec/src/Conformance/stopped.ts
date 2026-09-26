/**
 * The stop check (KTD1-KTD4, R4-R8): the unit runs uncut to count its steps and
 * to judge its rule without any cut, then it is stopped at every one of those
 * steps each of the three ways KTD2 names — told to stop, one fiber stopped,
 * and killed with no finalizers — and after each cut it is started again on the
 * same fake world, where its rule is judged. A cut run that never finishes,
 * that leaves fibers or outside calls running, or that reaches the real system
 * fails; so does a restart that never finishes or leaves work running. Code
 * that meets its rule never fails the check (R7).
 *
 * Each cut kind is swept on its own, and the report names the first failure of
 * each kind: one broken rule cannot hide which stops also went wrong (R8). A
 * sweep stops at its first failure, so a unit that passes pays one cut run and
 * one restart per step, three cuts deep, and its report says how many it tried.
 *
 * A stop is timed on the run's own virtual clock: `Clock.currentTimeMillis`
 * inside a kernel run is the kernel's virtual root clock, so the instant the
 * interruption reaches the unit — or, when the cut stops only another fiber,
 * the instant the unit's own body returned — and the instant the run leaves are
 * both read there. A stop that never ends, or that takes longer in virtual time
 * than the unit's own declared limit, did not stop in time (KTD3, KTD4).
 */
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Cause, Clock, Duration, Effect, Exit, Match, Option } from 'effect'
import type * as Scope from 'effect/Scope'

import { type Judgement, type Report, runFailureText, type StopCut, type StopProblem } from './report.js'
import { RuleBroken } from './rule-broken.schema.js'

/** What the check needs to stop one enrolled unit and judge what it owes (KTD1). */
export interface StopSpecification<W, A, E, A2, E2, U = unknown> {
  readonly unit: U
  readonly world: Effect.Effect<W>
  readonly program: (world: W) => Effect.Effect<A, E, Scope.Scope>
  readonly restart: (world: W) => Effect.Effect<A2, E2, Scope.Scope>
  readonly rule: (world: W) => Effect.Effect<void, RuleBroken>
  readonly stopWithin: Duration.Input
}

/** Everything the check uses but the enrolled unit itself. */
interface Task<W, A, E, A2, E2> {
  readonly world: Effect.Effect<W>
  readonly program: (world: W) => Effect.Effect<A, E, Scope.Scope>
  readonly restart: (world: W) => Effect.Effect<A2, E2, Scope.Scope>
  readonly rule: (world: W) => Effect.Effect<void, RuleBroken>
  readonly stopWithin: Duration.Input
}

/** What every kernel run reports, whatever its programs' channels are. */
interface History {
  readonly steps: ReadonlyArray<Kernel.StepRecord>
  readonly decisions: ReadonlyArray<Kernel.Decision>
}

type CutKind = Exclude<StopCut, 'uncut'>

interface Stopwatch {
  /** The virtual instant the stop began; rewritten when a later cut reaches it. */
  stopFrom: number | undefined
  /** How long the stop took in virtual time, read off when the run leaves. */
  stoppedFor: number | undefined
}

interface CutPoint {
  readonly cut: CutKind
  readonly step: number
  /** One-based position among the cut runs, in the order they are tried. */
  readonly ordinal: number
}

interface CutRun<A, E> {
  readonly ran: Kernel.RunResult<A, E>
  readonly watch: Stopwatch
}

interface Broken {
  readonly judgement: Judgement
  readonly ran: History
  /** The kernel runs the check had made when this broke. */
  readonly runs: number
}

interface BrokenSet {
  readonly first: Broken
  readonly rest: ReadonlyArray<Broken>
}

interface Counted<W, A, E> {
  readonly world: W
  readonly ran: Kernel.RunResult<A, E>
  readonly steps: number
}

const CUTS: ReadonlyArray<CutKind> = ['told-to-stop', 'one-fiber-stopped', 'killed']

const watchOf = (): Stopwatch => ({ stopFrom: undefined, stoppedFor: undefined })

const stoppedAt = (watch: Stopwatch, at: number): void => {
  watch.stopFrom = at
}

const elapsedSince = (watch: Stopwatch, at: number): number | undefined =>
  watch.stopFrom === undefined ? undefined : at - watch.stopFrom

const notingStop = (watch: Stopwatch): Effect.Effect<void> =>
  Effect.flatMap(Clock.currentTimeMillis, (at) => Effect.sync(() => stoppedAt(watch, at)))

const leaving = (watch: Stopwatch): Effect.Effect<void> =>
  Effect.flatMap(Clock.currentTimeMillis, (at) =>
    Effect.sync(() => {
      watch.stoppedFor = elapsedSince(watch, at)
    }))

/**
 * Wraps the unit so its stop is timed. The clock read after the body and the
 * one inside the interruption handler stamp the same field, so whichever the
 * cut produces — a body that returned before the stop, or an interruption the
 * unit observed — is the instant the stop began.
 */
const instrumented = <A, E>(
  program: Effect.Effect<A, E, Scope.Scope>,
  watch: Stopwatch,
): Effect.Effect<A, E> =>
  Effect.ensuring(
    Effect.scoped(Effect.onInterrupt(Effect.tap(program, () => notingStop(watch)), () => notingStop(watch))),
    leaving(watch),
  )

const killed = (point: CutPoint): boolean => point.cut === 'killed'

const interruptOf = (point: CutPoint): Kernel.Interruption => ({
  atStep: point.step,
  target: point.cut === 'told-to-stop' ? 'root' : 'lastRan',
})

const awaitOptionsOf = (point: CutPoint): Kernel.RunOptions =>
  killed(point)
    ? { external: 'await', maxSteps: point.step }
    : { external: 'await', interrupt: interruptOf(point) }

const limitMillis = (stopWithin: Duration.Input): number => Duration.toMillis(Duration.fromInputUnsafe(stopWithin))

const overran = (watch: Stopwatch, stopWithin: Duration.Input): boolean =>
  limitMillis(stopWithin) < (watch.stoppedFor ?? 0)

const judged = (problem: StopProblem, cut: StopCut, step: number | undefined, detail?: string): Judgement =>
  detail === undefined ? { problem, step, cut } : { problem, step, cut, detail }

const DEADLOCK_PROBLEM: Readonly<Record<StopCut, StopProblem>> = {
  uncut: 'stop-never-finished',
  'told-to-stop': 'stop-never-finished',
  'one-fiber-stopped': 'waited-forever',
  killed: 'waited-forever',
}

const failureProblem = (cut: StopCut, failure: Kernel.RunFailure): StopProblem =>
  Match.value(failure).pipe(
    Match.tag('Deadlock', () => DEADLOCK_PROBLEM[cut]),
    Match.tag('Runaway', () => 'stop-never-finished' as const),
    Match.orElse(() => 'reached-real-system' as const),
  )

const SITE_NAMED: Readonly<Record<Kernel.RunFailure['_tag'], boolean>> = {
  Escape: true,
  Blocked: true,
  Deadlock: false,
  Runaway: false,
}

const failureDetail = (failure: Kernel.RunFailure): string | undefined =>
  SITE_NAMED[failure._tag] ? runFailureText(failure) : undefined

const leftRunning = <A, E>(
  ran: Kernel.RunCompleted<A, E>,
  problem: StopProblem,
  cut: StopCut,
  step: number | undefined,
): Judgement | undefined => (ran.leftRunning.length === 0 ? undefined : judged(problem, cut, step))

const overrun = (watch: Stopwatch, cut: StopCut, step: number, stopWithin: Duration.Input): Judgement | undefined =>
  overran(watch, stopWithin) ? judged('stop-never-finished', cut, step) : undefined

const cutJudgement = <A, E>(
  point: CutPoint,
  ran: Kernel.RunResult<A, E>,
  watch: Stopwatch,
  stopWithin: Duration.Input,
): Judgement | undefined =>
  Match.value(ran).pipe(
    Match.tag('Completed', (completed) =>
      leftRunning(completed, 'left-running-after-stop', point.cut, point.step) ??
        overrun(watch, point.cut, point.step, stopWithin)),
    Match.orElse((failed) =>
      judged(failureProblem(point.cut, failed.failure), point.cut, point.step, failureDetail(failed.failure))
    ),
  )

const restartJudgement = <A, E>(
  ran: Kernel.RunResult<A, E>,
  cut: CutKind,
  step: number,
): Judgement | undefined =>
  Match.value(ran).pipe(
    Match.tag('Completed', (completed) => leftRunning(completed, 'restart-left-running', cut, step)),
    Match.orElse((failed) => judged('restart-never-finished', cut, step, failureDetail(failed.failure))),
  )

const ruleMessage = (cause: Cause.Cause<RuleBroken>): string | undefined => {
  const error = Cause.findErrorOption(cause)
  return Option.isSome(error) ? error.value.message : undefined
}

const ruleJudgement = (
  exit: Exit.Exit<void, RuleBroken>,
  cut: StopCut,
  step: number | undefined,
): Judgement | undefined =>
  Exit.isSuccess(exit) ? undefined : judged('stop-rule-broken', cut, step, ruleMessage(exit.cause))

const brokenOf = (judgement: Judgement | undefined, ran: History, runs: number): Broken | undefined =>
  judgement === undefined ? undefined : { judgement, ran, runs }

const orElseStage = (
  broken: Broken | undefined,
  next: Effect.Effect<Broken | undefined>,
): Effect.Effect<Broken | undefined> => (broken === undefined ? next : Effect.succeed(broken))

const orElseBroken = (
  found: Option.Option<Broken>,
  next: Effect.Effect<Broken | undefined>,
): Effect.Effect<Option.Option<Broken>> =>
  Option.isSome(found) ? Effect.succeed(found) : Effect.map(next, Option.fromNullishOr)

/** Tries each stage in order and stops at the first one that breaks. */
const firstBroken = (
  stages: ReadonlyArray<Effect.Effect<Broken | undefined>>,
): Effect.Effect<Option.Option<Broken>> =>
  stages.reduce(
    (found, stage) => Effect.flatMap(found, (broken) => orElseBroken(broken, stage)),
    Effect.succeed(Option.none<Broken>()),
  )

const firstOfStages = (
  stages: ReadonlyArray<Effect.Effect<Broken | undefined>>,
): Effect.Effect<Broken | undefined> => Effect.map(firstBroken(stages), Option.getOrUndefined)

const numberedSteps = (steps: number): ReadonlyArray<number> => Array.from({ length: steps }, numberedStep)

const numberedStep = (_unused: undefined, index: number): number => index + 1

const cutPointsOf = (cut: CutKind, steps: number): ReadonlyArray<CutPoint> =>
  numberedSteps(steps).map((step) => ({ cut, step, ordinal: cutOrdinal(cut, step, steps) }))

const cutOrdinal = (cut: CutKind, step: number, steps: number): number => CUTS.indexOf(cut) * steps + step

const runCut = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  point: CutPoint,
  world: W,
): Effect.Effect<CutRun<A, E>> =>
  Effect.gen(function*() {
    const watch = watchOf()
    const ran = yield* Effect.promise(() => Kernel.run(instrumented(task.program(world), watch), awaitOptionsOf(point)))
    return { ran, watch }
  })

const uncutJudgement = <A, E>(ran: Kernel.RunResult<A, E>): Judgement | undefined =>
  Match.value(ran).pipe(
    Match.tag('Completed', () => undefined),
    Match.orElse((failed) =>
      judged(failureProblem('uncut', failed.failure), 'uncut', undefined, failureDetail(failed.failure))
    ),
  )

const judgedRule = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  world: W,
  cut: StopCut,
  step: number | undefined,
  ran: History,
  runs: number,
): Effect.Effect<Broken | undefined> =>
  Effect.map(Effect.exit(task.rule(world)), (exit) => brokenOf(ruleJudgement(exit, cut, step), ran, runs))

const restarted = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  point: CutPoint,
  world: W,
): Effect.Effect<Broken | undefined> =>
  Effect.gen(function*() {
    const ran = yield* Effect.promise(() => Kernel.run(Effect.scoped(task.restart(world)), { external: 'await' }))
    const broken = brokenOf(restartJudgement(ran, point.cut, point.step), ran, 2 + 2 * point.ordinal)
    return yield* orElseStage(broken, judgedRule(task, world, point.cut, point.step, ran, 2 + 2 * point.ordinal))
  })

const attemptCut = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  point: CutPoint,
): Effect.Effect<Broken | undefined> =>
  Effect.flatMap(task.world, (world) =>
    Effect.flatMap(runCut(task, point, world), (cut) =>
      killed(point)
        ? restarted(task, point, world)
        : orElseStage(
          brokenOf(cutJudgement(point, cut.ran, cut.watch, task.stopWithin), cut.ran, 1 + 2 * point.ordinal),
          restarted(task, point, world),
        )))

const countedOf = <W, A, E, A2, E2>(task: Task<W, A, E, A2, E2>): Effect.Effect<Counted<W, A, E>> =>
  Effect.gen(function*() {
    const world = yield* task.world
    const ran = yield* Effect.promise(() =>
      Kernel.run(instrumented(task.program(world), watchOf()), { external: 'await' })
    )
    return { world, ran, steps: ran.steps.length }
  })

const sweepsOf = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  counted: Counted<W, A, E>,
): ReadonlyArray<Effect.Effect<Broken | undefined>> =>
  counted.steps === 0
    ? []
    : [
      uncutSweep(task, counted),
      ...CUTS.map((cut) => cutSweep(task, counted, cut)),
    ]

const uncutSweep = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  counted: Counted<W, A, E>,
): Effect.Effect<Broken | undefined> =>
  firstOfStages([
    Effect.succeed(brokenOf(uncutJudgement(counted.ran), counted.ran, 1)),
    judgedRule(task, counted.world, 'uncut', undefined, counted.ran, 1),
  ])

const cutSweep = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  counted: Counted<W, A, E>,
  cut: CutKind,
): Effect.Effect<Broken | undefined> =>
  firstOfStages(cutPointsOf(cut, counted.steps).map((point) => attemptCut(task, point)))

const collected = (
  so: Option.Option<BrokenSet>,
  sweep: Effect.Effect<Broken | undefined>,
): Effect.Effect<Option.Option<BrokenSet>> =>
  Effect.map(sweep, (broken) => (broken === undefined ? so : Option.some(addBroken(so, broken))))

const addBroken = (so: Option.Option<BrokenSet>, broken: Broken): BrokenSet =>
  Option.match(so, {
    onNone: () => ({ first: broken, rest: [] }),
    onSome: (set) => ({ first: set.first, rest: [...set.rest, broken] }),
  })

const swept = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  counted: Counted<W, A, E>,
): Effect.Effect<Option.Option<BrokenSet>> =>
  sweepsOf(task, counted).reduce(
    (so, sweep) => Effect.flatMap(so, (found) => collected(found, sweep)),
    Effect.succeed(Option.none<BrokenSet>()),
  )

/** A value read from code this package does not own. */
type Field<A = unknown> = A

const unitNameOn = (unit: object, key: string): string | undefined => {
  const value: Field = Reflect.get(unit, key)
  return typeof value === 'string' ? value : undefined
}

const OBJECT_LIKE: Readonly<Record<string, boolean>> = { object: true, function: true }

const isNamed = (candidate: unknown): candidate is object =>
  candidate !== null && OBJECT_LIKE[typeof candidate] === true

const firstNamed = (...candidates: ReadonlyArray<string | undefined>): string | undefined =>
  candidates.find((candidate) => candidate !== undefined)

const unitName = <U>(unit: U): string | undefined =>
  isNamed(unit) ? firstNamed(unitNameOn(unit, 'name'), unitNameOn(unit, '_tag'), unitNameOn(unit, 'typeId')) : undefined

const unitField = (name: string | undefined): { readonly unit?: string } => (name === undefined ? {} : { unit: name })

const boundOf = (ran: History, runs: number): Kernel.Bound => ({
  fibers: new Set(ran.steps.map((step) => step.fiberId)).size,
  operations: ran.steps.length,
  preemptions: 0,
  depth: 0,
  runs,
  pruning: Kernel.pruned,
})

const failReport = (name: string | undefined, set: BrokenSet): Report<never, never> => ({
  _tag: 'Fail',
  failure: {
    judgement: set.first.judgement,
    schedule: set.first.ran.decisions,
    deviations: set.first.ran.steps.filter((step) => step.deviation).length,
    operations: [],
    bound: boundOf(set.first.ran, set.first.runs),
    otherCutJudgements: set.rest.map((broken) => broken.judgement),
    ...unitField(name),
  },
})

const cutCount = (steps: number): number => CUTS.length * steps

const passReport = (name: string | undefined, ran: History, steps: number): Report<never, never> => ({
  _tag: 'Pass',
  bound: boundOf(ran, 1 + 2 * cutCount(steps)),
  histories: cutCount(steps),
  stopCuts: cutCount(steps),
  ...unitField(name),
})

const failureOf = <A, E>(ran: Kernel.RunResult<A, E>): Kernel.RunFailure | undefined =>
  Match.value(ran).pipe(
    Match.tag('Completed', () => undefined),
    Match.orElse((failed) => failed.failure),
  )

const uncheckedReport = <A, E>(name: string | undefined, ran: Kernel.RunResult<A, E>): Report<never, never> => ({
  _tag: 'Incomplete',
  incomplete: {
    failure: failureOf(ran),
    schedule: ran.decisions,
    bound: boundOf(ran, 1),
    stopNote: 'the unit took no steps, so there was nothing to stop at',
  },
})

const passedOrUnchecked = <A, E>(
  name: string | undefined,
  ran: Kernel.RunResult<A, E>,
  steps: number,
): Report<never, never> => (steps === 0 ? uncheckedReport(name, ran) : passReport(name, ran, steps))

const reportOf = <W, A, E>(
  name: string | undefined,
  counted: Counted<W, A, E>,
  broken: Option.Option<BrokenSet>,
): Report<never, never> =>
  Option.match(broken, {
    onNone: () => passedOrUnchecked(name, counted.ran, counted.steps),
    onSome: (set) => failReport(name, set),
  })

const checked = <W, A, E, A2, E2>(
  task: Task<W, A, E, A2, E2>,
  name: string | undefined,
): Effect.Effect<Report<never, never>> =>
  Effect.flatMap(
    countedOf(task),
    (counted) => Effect.map(swept(task, counted), (broken) => reportOf(name, counted, broken)),
  )

const taskOf = <W, A, E, A2, E2, U>(
  specification: StopSpecification<W, A, E, A2, E2, U>,
): Task<W, A, E, A2, E2> => ({
  world: specification.world,
  program: specification.program,
  restart: specification.restart,
  rule: specification.rule,
  stopWithin: specification.stopWithin,
})

export const stopped = <W, A, E, A2, E2, U>(
  specification: StopSpecification<W, A, E, A2, E2, U>,
): Effect.Effect<Report<never, never>> => checked(taskOf(specification), unitName(specification.unit))

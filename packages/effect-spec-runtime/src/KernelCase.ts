/// <reference types="node" />
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Cause, Config, Context, Effect, Exit, Fiber, Layer, Match, Option, Ref, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import * as TaskRef from './TaskRef.service.js'

/**
 * The live declaration a case carries instead of the `liveClock` boolean
 * (KTD11): a required reason string, so the run report can name every live
 * case with the reason it stayed on the live clock.
 */
export interface LiveCase {
  readonly reason: string
}

/**
 * One run's program: the case's layers build under the zero-preemption
 * schedule, exploration is marked, and the scenario body runs under the
 * kernel's test clock inside a scope the run owns.
 */
const exploredCase = <B, E, R, RIn extends Scope.Scope>(
  body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
  env: Layer.Layer<R, never, RIn>,
): Effect.Effect<B, E, Scope.Scope> =>
  Effect.gen(function*() {
    const built = yield* Layer.build(env)
    yield* Kernel.beginExploration
    return yield* Effect.provideContext(body, built)
  })

/**
 * Closes the case's scope when the program settles: every resource the case
 * acquired — its layers and its body — is released whether the body succeeds,
 * fails, or is interrupted.
 */
const caseScope = Effect.scoped

/**
 * Marks where the harness's own setup ends and the explored body begins:
 * the case's layers build before it (fresh in every run, under the
 * zero-preemption schedule), the scenario body runs after it.
 */
export const caseProgram: {
  <B, E, R, RIn extends Scope.Scope>(
    env: Layer.Layer<R, never, RIn>,
  ): (body: Effect.Effect<B, E, R | RIn | Scope.Scope>) => Effect.Effect<B, E>
  <B, E, R, RIn extends Scope.Scope>(
    body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
    env: Layer.Layer<R, never, RIn>,
  ): Effect.Effect<B, E>
} = dual(
  (args: IArguments): boolean => args.length === 2 && Effect.isEffect(args[0]),
  <B, E, R, RIn extends Scope.Scope>(
    body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
    env: Layer.Layer<R, never, RIn>,
  ): Effect.Effect<B, E> => caseScope(Effect.provide(exploredCase(body, env), Kernel.TestClock.layer)),
)

/** Announces a live case with its reason, which is how the run report lists it. */
export const announceLive = (reason: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const task = yield* TaskRef.RawVitestTaskRef
    return yield* announce(task, reason)
  })

const dispatchAnnotate = (
  annotate: TaskRef.VitestTaskContext['annotate'],
  message: string,
): Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(annotate), {
    onNone: () => Effect.void,
    onSome: (record) => Effect.promise(() => Promise.resolve(record(message))),
  })

const announce = (
  task: TaskRef.VitestTaskContext | null,
  reason: string,
): Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(task), {
    onNone: () => Effect.void,
    onSome: (context) => dispatchAnnotate(context.annotate, `live case: ${reason}`),
  })

/**
 * One live case's program: the case's layers build fresh around the case and
 * the scenario body runs under them; the live-clock runner provides the
 * scope.
 */
const announcedCase = <B, E, R, RIn extends Scope.Scope>(
  body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
  env: Layer.Layer<R, never, RIn>,
  reason: string,
): Effect.Effect<B, E, Scope.Scope> =>
  Effect.gen(function*() {
    const built = yield* Layer.build(env)
    yield* announceLive(reason)
    return yield* Effect.provideContext(body, built)
  })

/**
 * Runs a live-declared case: the case's layers are rebuilt fresh around the
 * case, the reason is announced before the body, and the live-clock runner
 * provides the case scope.
 */
export const liveCase: {
  <B, E, R, RIn extends Scope.Scope>(
    env: Layer.Layer<R, never, RIn>,
    reason: string,
  ): (body: Effect.Effect<B, E, R | RIn | Scope.Scope>) => Effect.Effect<B, E, Scope.Scope>
  <B, E, R, RIn extends Scope.Scope>(
    body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
    env: Layer.Layer<R, never, RIn>,
    reason: string,
  ): Effect.Effect<B, E, Scope.Scope>
} = dual(
  (args: IArguments): boolean => args.length === 3 && Effect.isEffect(args[0]),
  <B, E, R, RIn extends Scope.Scope>(
    body: Effect.Effect<B, E, R | RIn | Scope.Scope>,
    env: Layer.Layer<R, never, RIn>,
    reason: string,
  ): Effect.Effect<B, E, Scope.Scope> => announcedCase(body, env, reason),
)

interface Schedule {
  readonly seed: number | undefined
  readonly decisions: ReadonlyArray<Kernel.Decision>
}

const replayValueOf = (schedule: Schedule): string => {
  const path = `path=${schedule.decisions.join(',')}`
  if (schedule.seed === undefined) return path
  return `seed=${schedule.seed};${path}`
}

const describeSchedule = (schedule: Schedule): string =>
  schedule.seed === undefined ? "Effect's order" : `seed ${schedule.seed}`

const scheduleReport = (schedule: Schedule, detail: string): string =>
  `${detail}\nschedule: ${describeSchedule(schedule)}\nreplay with: CONFORMANCE_REPLAY="${replayValueOf(schedule)}"`

const describeSuspended = (fiber: Kernel.SuspendedFiber): string => {
  const first = fiber.frames[0]
  if (first === undefined) return `fiber ${fiber.id}`
  return `fiber ${fiber.id} at ${first}`
}

const describeKernelFailure = (failure: Kernel.RunFailure): string =>
  Match.value(failure).pipe(
    Match.when(
      { _tag: 'Escape' },
      (escape) => `escaped the controlled schedule through the ${escape.timer} timer at ${escape.site}`,
    ),
    Match.when(
      { _tag: 'Blocked' },
      (blocked) => `waited on a resource the kernel cannot observe: ${blocked.resources.join(', ')}`,
    ),
    Match.when(
      { _tag: 'Deadlock' },
      (deadlock) =>
        `deadlocked with ${deadlock.suspended.length} suspended fibers: ${
          deadlock.suspended.map(describeSuspended).join('; ')
        }`,
    ),
    Match.when(
      { _tag: 'Runaway' },
      (runaway) => `ran past ${runaway.steps} steps with ${runaway.pending} fibers pending`,
    ),
    Match.exhaustive,
  )

const throwExitFailure = <A, E>(exit: Exit.Failure<A, E>, schedule: Schedule): never => {
  const errors = Cause.prettyErrors(exit.cause)
  const first = errors[0]
  const reported = first === undefined ? new Error(Cause.pretty(exit.cause)) : first
  reported.message = `${reported.message}\n\n${scheduleReport(schedule, 'the scenario body failed')}`
  throw reported
}

const throwKernelFailure = (failure: Kernel.RunFailure, schedule: Schedule): never => {
  throw new Error(scheduleReport(schedule, describeKernelFailure(failure)))
}

const isKernelFailure = <A, E>(observed: Kernel.RunResult<A, E>): observed is Kernel.RunFailed => 'failure' in observed

const throwIfExitFailed = <A, E>(observed: Kernel.RunCompleted<A, E>, schedule: Schedule): void => {
  if (Exit.isFailure(observed.exit)) throwExitFailure(observed.exit, schedule)
}

const throwIfFailed = <A, E>(observed: Kernel.RunResult<A, E>, schedule: Schedule): void => {
  if (!isKernelFailure(observed)) throwIfExitFailed(observed, schedule)
  else throwKernelFailure(observed.failure, schedule)
}

interface Survey {
  readonly fibers: number
  readonly steps: number
}

const surveyOf = <A, E>(baseline: Kernel.RunResult<A, E>): Survey => ({
  fibers: new Set(baseline.steps.map((step) => step.fiberId)).size,
  steps: baseline.steps.length,
})

const budgetOf = (survey: Survey): Promise<number> =>
  Effect.runPromise(Kernel.currentSeedsFor({ fibers: survey.fibers, steps: survey.steps }))

const seedList = (count: number): ReadonlyArray<number> => Array.from({ length: count }, (_entry, seed) => seed)

const seedsToRun = (seed: number | undefined, budget: number): ReadonlyArray<number> => {
  if (seed === undefined) return seedList(budget)
  return [seed]
}

const SEED_PATTERN = /seed=(\d+)/u
const PATH_PATTERN = /path=((?:\d+)(?:,\d+)*)/u

interface Replay {
  readonly seed: number | undefined
  readonly path: ReadonlyArray<Kernel.Decision> | undefined
}

const seedOf = (value: string): number | undefined => {
  const match = SEED_PATTERN.exec(value)
  if (match === null) return undefined
  return Number(match[1])
}

const pathOf = (value: string): ReadonlyArray<Kernel.Decision> | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.flatMap(
        Option.fromNullishOr(PATH_PATTERN.exec(value)),
        (match) => Option.fromNullishOr(match[1]),
      ),
      (raw) => raw.split(',').map((entry) => Number(entry)),
    ),
  )

const isEmptyReplay = (replay: Replay): boolean => replay.seed === undefined && replay.path === undefined

const replayOf = (value: string): Replay => {
  const replay: Replay = { seed: seedOf(value), path: pathOf(value) }
  if (isEmptyReplay(replay)) {
    throw new Error(`CONFORMANCE_REPLAY names neither a seed nor a decision path: ${value}`)
  }
  return replay
}

const readReplayValue = (): Promise<string | undefined> =>
  Effect.runPromise(
    Effect.map(Config.option(Config.String('CONFORMANCE_REPLAY')), Option.getOrUndefined),
  )

const replayRun = <A, E>(
  program: Effect.Effect<A, E>,
  path: ReadonlyArray<Kernel.Decision>,
): Promise<void> =>
  Kernel.run(program, { explore: 'body', path }).then((observed) => {
    throwIfFailed(observed, { seed: undefined, decisions: path })
  })

const runSeeds = <A, E>(
  program: Effect.Effect<A, E>,
  seeds: ReadonlyArray<number>,
  at: number,
  steps: number,
): Promise<void> => {
  const seed = seeds[at]
  if (seed === undefined) return Promise.resolve()
  return Kernel.run(program, { explore: 'body', choose: Kernel.pick({ seed, steps }) }).then((observed) => {
    throwIfFailed(observed, { seed, decisions: observed.decisions })
    return runSeeds(program, seeds, at + 1, steps)
  })
}

const seededRuns = <A, E>(program: Effect.Effect<A, E>, seed: number | undefined, survey: Survey): Promise<void> =>
  budgetOf(survey).then((budget) => runSeeds(program, seedsToRun(seed, budget), 0, survey.steps))

const baselineThen = <A, E>(program: Effect.Effect<A, E>, seed: number | undefined): Promise<void> =>
  Kernel.run(program, { explore: 'body' }).then((baseline) => {
    throwIfFailed(baseline, { seed: undefined, decisions: baseline.decisions })
    return seededRuns(program, seed, surveyOf(baseline))
  })

const replayOrSeeded = <A, E>(program: Effect.Effect<A, E>, replay: Replay): Promise<void> => {
  if (replay.path !== undefined) return replayRun(program, replay.path)
  return baselineThen(program, replay.seed)
}

/**
 * Runs one case's program under the kernel: the direct order first, then the
 * profile's seeded PCT schedules at the profile depth. A failure reports its
 * seed and decision path, which `CONFORMANCE_REPLAY` reproduces.
 */
export const explore = <A, E>(program: Effect.Effect<A, E>): Promise<void> =>
  readReplayValue().then((value) => {
    if (value === undefined) return baselineThen(program, undefined)
    return replayOrSeeded(program, replayOf(value))
  })

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')

  const ReplayRow = Schema.Struct({
    seed: Schema.Natural.pipe(Schema.check(Schema.isLessThanOrEqualTo(1_000_000))),
    path: Schema.Natural.pipe(Schema.check(Schema.isLessThanOrEqualTo(10))),
  })

  const pathTextOf = (replay: Replay): string | undefined => {
    const path = replay.path
    if (path === undefined) return undefined
    return path.join(',')
  }

  const matchesDraw = (replay: Replay, seed: number, path: string): boolean =>
    replay.seed === seed && pathTextOf(replay) === path

  const replayText = (row: typeof ReplayRow.Type): string => `seed=${row.seed};path=${row.path}`

  it.prop(
    '∀row_ReplayOfSeedAndPath_=TheDrawnSeedAndPath',
    { of: [ReplayRow], subject: replayOf },
    (parse, [row]) => matchesDraw(parse(replayText(row)), row.seed, String(row.path)),
  )

  const LiveReason = 'waits on a container that completes outside the process'

  const annotationsOf = (seen: Array<string>): TaskRef.VitestTaskContext => ({
    annotate: (message: string) => {
      seen.push(message)
    },
  })

  const announcedReason = (seen: Array<string>, reason: string): boolean =>
    seen.length === 1 && seen[0] === `live case: ${reason}`

  it.effect.prop(
    '∀reason_AnnounceLive_=LabelledLiveCaseWithoutATask',
    { of: [Schema.String], subject: announceLive },
    (announce, [reason]) =>
      Effect.gen(function*() {
        const seen: Array<string> = []
        yield* announce(reason).pipe(
          Effect.provideService(TaskRef.RawVitestTaskRef, annotationsOf(seen)),
        )
        yield* announce(reason).pipe(Effect.provideService(TaskRef.RawVitestTaskRef, null))
        return announcedReason(seen, reason)
      }),
  )

  const ProbeValue = Schema.Natural.pipe(Schema.check(Schema.isLessThanOrEqualTo(1_000)))

  class Probe extends Context.Service<Probe, number>()('@systemfsoftware/effect-spec-runtime/test/Probe') {}

  const announcedOnce = (seen: Array<string>): boolean => seen.length === 1 && seen[0] === `live case: ${LiveReason}`

  const readLiveCase = (value: number): Effect.Effect<{ readonly read: number; readonly announced: boolean }> => {
    const seen: Array<string> = []
    return Effect.map(
      Effect.scoped(liveCase(Probe, Layer.succeed(Probe, value), LiveReason)).pipe(
        Effect.provideService(TaskRef.RawVitestTaskRef, annotationsOf(seen)),
      ),
      (read) => ({ read, announced: announcedOnce(seen) }),
    )
  }

  const readObserved = (observed: { readonly read: number; readonly announced: boolean }, value: number): boolean =>
    observed.read === value && observed.announced

  it.effect.prop(
    '∀value_LiveCase_=BuiltEnvReadBodyAndAnnouncedReason',
    { of: [ProbeValue], subject: readLiveCase },
    (read, [value]) => Effect.map(read(value), (observed) => readObserved(observed, value)),
  )

  const CaseOutcome = Schema.Literals(['success', 'failure', 'interrupted', 'unscoped'])

  const expectsRelease = (outcome: typeof CaseOutcome.Type): boolean => outcome !== 'unscoped'

  const acquired = (released: Ref.Ref<boolean>): Effect.Effect<string, never, Scope.Scope> =>
    Effect.acquireRelease(Effect.succeed('the case resource'), () => Ref.set(released, true))

  const bodyOf = (
    outcome: 'success' | 'failure',
    released: Ref.Ref<boolean>,
  ): Effect.Effect<string, string, Scope.Scope> =>
    outcome === 'success'
      ? acquired(released)
      : acquired(released).pipe(Effect.andThen(Effect.fail('the case body failed')))

  const settledRelease = (outcome: 'success' | 'failure'): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      const released = yield* Ref.make(false)
      yield* Effect.exit(caseScope(bodyOf(outcome, released)))
      return yield* Ref.get(released)
    })

  const interruptedRelease: Effect.Effect<boolean> = Effect.gen(function*() {
    const released = yield* Ref.make(false)
    const running = yield* Effect.forkChild(
      caseScope(acquired(released).pipe(Effect.andThen(Effect.never))),
      { startImmediately: true },
    )
    yield* Fiber.interrupt(running)
    return yield* Ref.get(released)
  })

  const releaseUnder = (outcome: 'success' | 'failure' | 'interrupted'): Effect.Effect<boolean> =>
    outcome === 'interrupted' ? interruptedRelease : settledRelease(outcome)

  const releasedWhenScoped = (outcome: typeof CaseOutcome.Type): Effect.Effect<boolean> =>
    outcome === 'unscoped' ? Effect.succeed(false) : releaseUnder(outcome)

  it.effect.prop(
    '∀outcome_CaseScope_=TheScopedEnvironmentIsReleased',
    { of: [CaseOutcome], subject: releasedWhenScoped },
    (scoped, [outcome]) => Effect.map(scoped(outcome), (released) => released === expectsRelease(outcome)),
  )
}

/**
 * The async step loop (R1, R4, R5, R36). It picks one pending task per step —
 * by a caller-supplied decision path, a `choose` callback, or Effect's own
 * dispatcher order — runs it to its next yield, and drains in-process
 * microtasks after every step so a Promise-woken fiber becomes the next
 * scheduling choice. At quiescence the kernel settles its clocks (R37), and
 * when nothing can move it names what the run waits on; a deadlock report
 * lists every suspended fiber with its frames.
 *
 * The loop is written as explicit Promise chains on purpose: the kernel has to
 * run outside Effect's runtime to control scheduling, and every `.then` is one
 * microtask checkpoint — exactly the in-process work R36 hands to the kernel.
 */
import { Clock, Effect, Exit } from 'effect'
import { dual } from 'effect/Function'

import { stepClocks } from './clocks.js'
import { describeSuspended, newResources, resourceCounts, waitKindOf } from './deadlock.js'
import type { AnyFiber, SuspendedFiber, WaitKind } from './deadlock.js'
import { installEscapeRecorder } from './escapeRecorder.js'
import type { Escape, HostTimer, TimerName } from './escapeRecorder.js'
import { makeKernel } from './kernel.js'
import type { Task } from './kernel.js'
import type { Choice, ChoiceOption, Decision, FiberTarget, Kernel, StepInput, StepRecord } from './kernel.js'
import { currentKernel } from './runMark.js'

/**
 * The discriminant tags of the run outcome; the variants inherit them because
 * an `Exit` cannot travel through a schema.
 */
/** @internal */
export const runOutcomeTags = {
  completed: { _tag: 'Completed' },
  failed: { _tag: 'Failed' },
  escape: { _tag: 'Escape' },
  blocked: { _tag: 'Blocked' },
  deadlock: { _tag: 'Deadlock' },
  runaway: { _tag: 'Runaway' },
} as const

/** @internal */
export type RunCompleted<A, E> = RunHistory & typeof runOutcomeTags.completed & {
  readonly exit: Exit.Exit<A, E>
}

/** @internal */
export type RunFailed = RunHistory & typeof runOutcomeTags.failed & { readonly failure: RunFailure }

/** @internal */
export interface RunHistory {
  /** Which fiber ran at each step, in order (R3). */
  readonly steps: ReadonlyArray<StepRecord>
  /** The decisions the schedule explored, in order (R4's replayable path). */
  readonly decisions: ReadonlyArray<Decision>
}

/** @internal */
export type RunResult<A, E> = RunCompleted<A, E> | RunFailed

/** Why a run failed, with what a report needs to name it. */
/** @internal */
export type EscapeFailure = typeof runOutcomeTags.escape & {
  readonly timer: TimerName
  readonly site: string
}

/** @internal */
export type BlockedFailure = typeof runOutcomeTags.blocked & {
  readonly on: WaitKind
  readonly resources: ReadonlyArray<string>
}

/** @internal */
export type DeadlockFailure = typeof runOutcomeTags.deadlock & {
  readonly suspended: ReadonlyArray<SuspendedFiber>
}

/** @internal */
export type RunawayFailure = typeof runOutcomeTags.runaway & {
  readonly steps: number
  readonly pending: number
}

/** @internal */
export type RunFailure = EscapeFailure | BlockedFailure | DeadlockFailure | RunawayFailure

/** @internal */
export interface Interruption {
  /** The one-based step after whose task the fiber is interrupted. */
  readonly atStep: number
  /** Which fiber to interrupt; the root when omitted (R5). */
  readonly target?: FiberTarget
}

/** @internal */
export interface RunOptions {
  /**
   * The decisions to take, one per explored step (R4). An `undefined` entry,
   * or a step past the end of the path, takes Effect's order.
   */
  readonly path?: ReadonlyArray<Decision | undefined>
  /**
   * Chooses beyond the recorded path (seam for PCT and bounded search).
   * Returning undefined takes the zero-preemption choice.
   */
  readonly choose?: (choice: Choice) => Decision | undefined
  /** Interrupts one fiber at a chosen step (R5). */
  readonly interrupt?: Interruption
  /**
   * What a stall on the host means. `'fail'` (the default) names the wait and
   * fails the run, so an explored schedule stays replayable (R36). `'await'`
   * yields to the host until a file or socket wait settles, then continues
   * stepping, for checks that run one ordered program against the real system.
   * A real-timer wait still fails (`Escape`, per R2); `'await'` beside `path`
   * or `choose` is rejected, so it cannot silently weaken an exploring run.
   */
  readonly external?: 'fail' | 'await'
  /**
   * `'body'` keeps every decision before `beginExploration` on Effect's order,
   * so a harness's own setup is never explored (R15).
   */
  readonly explore?: 'all' | 'body'
  /** Fails the run once it passes this many steps. */
  readonly maxSteps?: number
  /** Microtask checkpoints drained after each step. */
  readonly stepTurns?: number
  /** Microtask checkpoints drained once nothing is pending. */
  readonly quiescenceTurns?: number
  /**
   * Called once nothing in the process can run or wake a fiber after the
   * kernel's clocks had their quiescent move (seam for live I/O waits, R16).
   * Returning true continues the run; returning false classifies the stall.
   */
  readonly onQuiescent?: () => boolean
}

const DEFAULT_MAX_STEPS = 50_000
const DEFAULT_STEP_TURNS = 4
const DEFAULT_QUIESCENCE_TURNS = 1_000
const MAX_HOST_WAITS = 10_000

interface Drive<A, E> {
  readonly kernel: Kernel
  readonly root: AnyFiber<A, E>
  readonly options: RunOptions
  readonly before: ReadonlyMap<string, number>
  readonly guard: number
  readonly hostImmediate: HostTimer
}

/**
 * Marks the point in a program where exploration may begin (R15). Under
 * `explore: 'body'`, every decision before it stays on Effect's order.
 */
/** @internal */
export const beginExploration: Effect.Effect<void> = Effect.sync(() => {
  const kernel = currentKernel()
  if (kernel !== undefined) kernel.beginExploration()
})

/** One microtask checkpoint: already-queued callbacks run before this resumes. */
const turn = <T>(value: T): Promise<T> => Promise.resolve().then(() => value)

const drain = (turns: number): Promise<void> =>
  turns <= 0 ? Promise.resolve() : turn(undefined).then(() => drain(turns - 1))

const maxStepsOf = (options: RunOptions): number => options.maxSteps ?? DEFAULT_MAX_STEPS
const stepTurnsOf = (options: RunOptions): number => options.stepTurns ?? DEFAULT_STEP_TURNS
const quiescenceTurnsOf = (options: RunOptions): number => options.quiescenceTurns ?? DEFAULT_QUIESCENCE_TURNS

const choiceOption = (task: Task, index: Decision, fallback: Decision): ChoiceOption => ({
  fiberId: task.owner?.id,
  isDefault: index === fallback,
  external: task.external,
  forced: task.forced,
})

const choiceOptions = (kernel: Kernel, fallback: Decision): ReadonlyArray<ChoiceOption> =>
  kernel.pending.map((task, index) => choiceOption(task, index, fallback))

const recordedAt = (kernel: Kernel, options: RunOptions): Decision | undefined =>
  options.path?.[kernel.decisions.length]

const chosenBy = (kernel: Kernel, options: RunOptions, fallback: Decision): Decision | undefined => {
  const choice: Choice = { index: kernel.decisions.length, options: choiceOptions(kernel, fallback) }
  return options.choose?.(choice)
}

const pathOrChoose = (kernel: Kernel, options: RunOptions, fallback: Decision): Decision | undefined => {
  const recorded = recordedAt(kernel, options)
  if (recorded !== undefined) return recorded
  return chosenBy(kernel, options, fallback)
}

const exploredChoice = (kernel: Kernel, options: RunOptions, fallback: Decision): Decision | undefined => {
  if (!kernel.exploring) return undefined
  return pathOrChoose(kernel, options, fallback)
}

const boundedChoice = (kernel: Kernel, chosen: Decision | undefined, fallback: Decision): Decision => {
  if (chosen === undefined) return fallback
  return Math.max(0, Math.min(chosen, kernel.pending.length - 1))
}

const decide = (kernel: Kernel, options: RunOptions): StepInput => {
  const fallback = kernel.effectDefault()
  return {
    choice: boundedChoice(kernel, exploredChoice(kernel, options, fallback), fallback),
    options: kernel.pending.length,
    fallback,
  }
}

const escapeFailureOf = (escaped: Escape): RunFailure => ({
  ...runOutcomeTags.escape,
  timer: escaped.timer,
  site: escaped.site,
})

const runawayOf = (kernel: Kernel, options: RunOptions, guard: number): RunFailure | undefined => {
  if (guard <= maxStepsOf(options)) return undefined
  return { ...runOutcomeTags.runaway, steps: kernel.steps.length, pending: kernel.pending.length }
}

const quiescenceFailure = (kernel: Kernel, before: ReadonlyMap<string, number>): RunFailure => {
  const resources = newResources(before)
  if (resources.length === 0) {
    return { ...runOutcomeTags.deadlock, suspended: describeSuspended(kernel.fibers) }
  }
  return { ...runOutcomeTags.blocked, on: waitKindOf(resources), resources }
}

const isBlockedStall = (excuse: RunFailure): excuse is BlockedFailure => 'on' in excuse

const isAwaitableKind = (excuse: BlockedFailure): boolean => excuse.on === 'File' || excuse.on === 'Socket'

const isAwaitableStall = (excuse: RunFailure): boolean => isBlockedStall(excuse) && isAwaitableKind(excuse)

const awaitsStall = (options: RunOptions, excuse: RunFailure): boolean =>
  options.external === 'await' && isAwaitableStall(excuse)
const tasksPending = <A, E>(state: Drive<A, E>): boolean => state.kernel.pending.length > 0

const hostCheckYield = <A, E>(state: Drive<A, E>): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  state.hostImmediate(() => resolve(undefined))
  return promise
}

const hostYield = <A, E>(state: Drive<A, E>): Promise<void> =>
  hostCheckYield(state).then(() => drain(DEFAULT_STEP_TURNS)).then(() => drain(DEFAULT_QUIESCENCE_TURNS))

const awaitedResources = <A, E>(state: Drive<A, E>): ReadonlyArray<string> => newResources(state.before)

const waitsRemain = (resources: ReadonlyArray<string>): boolean =>
  resources.some((resource) => waitKindOf([resource]) === 'File' || waitKindOf([resource]) === 'Socket')

const revivedDrive = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E>> =>
  drive({ ...state, before: resourceCounts() })

const waitedOutcome = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> => revivedAfterHost(state, 0)

const revivedAfterHost = <A, E>(state: Drive<A, E>, waited: number): Promise<RunResult<A, E> | undefined> =>
  hostYield(state).then(() => revivedAfterYield(state, waited))

const revivedAfterYield = <A, E>(state: Drive<A, E>, waited: number): Promise<RunResult<A, E> | undefined> =>
  tasksPending(state) ? revivedDrive(state) : revivedByResources(state, waited)

const revivedByResources = <A, E>(state: Drive<A, E>, waited: number): Promise<RunResult<A, E> | undefined> =>
  waitsRemain(awaitedResources(state)) ? revivedAfterLimit(state, waited) : revivedAfterHost(state, waited + 1)

const revivedAfterLimit = <A, E>(state: Drive<A, E>, waited: number): Promise<RunResult<A, E> | undefined> =>
  waited > MAX_HOST_WAITS
    ? Promise.resolve(failedOn<A, E>(state.kernel, quiescenceFailure(state.kernel, state.before)))
    : revivedAfterHost(state, waited + 1)

const waitForExternal = <A, E>(state: Drive<A, E>, _excuse: RunFailure): Promise<RunResult<A, E> | undefined> =>
  drain(quiescenceTurnsOf(state.options)).then(() => waitedOutcome(state))

const awaitedStall = <A, E>(
  state: Drive<A, E>,
  excuse: RunFailure,
): Promise<RunResult<A, E> | undefined> =>
  awaitsStall(state.options, excuse)
    ? waitForExternal(state, excuse)
    : Promise.resolve(failedOn<A, E>(state.kernel, excuse))

const stallByExternal = <A, E>(state: Drive<A, E>, excuse: RunFailure): Promise<RunResult<A, E> | undefined> =>
  awaitedStall(state, excuse)

const classifyStall = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> =>
  seamOffersProgress(state.options.onQuiescent)
    ? Promise.resolve(undefined)
    : stallByExternal(state, quiescenceFailure(state.kernel, state.before))

const seamOrFailure = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> => classifyStall(state)

const completedOn = <A, E>(kernel: Kernel, exit: Exit.Exit<A, E>): RunResult<A, E> => ({
  ...runOutcomeTags.completed,
  exit,
  steps: kernel.steps,
  decisions: kernel.decisions,
})

const failedOn = <A, E>(kernel: Kernel, failure: RunFailure): RunResult<A, E> => ({
  ...runOutcomeTags.failed,
  failure,
  steps: kernel.steps,
  decisions: kernel.decisions,
})

const interruptLive = (kernel: Kernel, fiber: AnyFiber | undefined): void => {
  if (fiber !== undefined) kernel.interrupt(fiber)
}

const interruptTarget = (kernel: Kernel, target: FiberTarget | undefined): void =>
  interruptLive(kernel, kernel.resolveTarget(target ?? 'root'))

const interruptAt = (kernel: Kernel, interruption: Interruption): void => {
  if (kernel.steps.length !== interruption.atStep) return
  interruptTarget(kernel, interruption.target)
}

const applyInterrupt = (kernel: Kernel, options: RunOptions): void => {
  const interruption = options.interrupt
  if (interruption !== undefined) interruptAt(kernel, interruption)
}

const advance = <A, E>(state: Drive<A, E>): Promise<void> => {
  state.kernel.step(decide(state.kernel, state.options))
  applyInterrupt(state.kernel, state.options)
  return drain(stepTurnsOf(state.options))
}

const seamOffersProgress = (seam: (() => boolean) | undefined): boolean => seam !== undefined && seam()

const resettled = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> => {
  if (state.kernel.pending.length > 0) return Promise.resolve(undefined)
  return seamOrFailure(state)
}
const stalled = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> =>
  drain(quiescenceTurnsOf(state.options)).then(() => resettled(state))

const quiescent = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> => {
  const exit = state.root.pollUnsafe()
  if (exit !== undefined) return Promise.resolve(completedOn(state.kernel, exit))
  return stalled(state)
}

const settled = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> => {
  if (state.kernel.pending.length > 0) return Promise.resolve(undefined)
  return quiescent(state)
}
const progressed = <A, E>(
  state: Drive<A, E>,
  done: RunResult<A, E> | undefined,
): Promise<RunResult<A, E> | undefined> =>
  done !== undefined ? Promise.resolve(done) : advance(state).then(() => undefined)

const escapeOrRunaway = (kernel: Kernel, options: RunOptions, guard: number): RunFailure | undefined => {
  const escaped = kernel.escapes[0]
  if (escaped !== undefined) return escapeFailureOf(escaped)
  return runawayOf(kernel, options, guard)
}

const rejectsChosenExploration = (options: RunOptions): boolean =>
  options.path !== undefined || options.choose !== undefined

const rejectsAwaitedExploration = (options: RunOptions): boolean =>
  options.external === 'await' && rejectsChosenExploration(options)

const rejectAwaitedExploration = (options: RunOptions): void => {
  if (rejectsAwaitedExploration(options)) {
    throw new Error(
      'effect-sim-kernel: external "await" runs only on Effect\'s own order, so it refuses path and choose',
    )
  }
}

const iteration = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> => {
  const halt = escapeOrRunaway(state.kernel, state.options, state.guard)
  if (halt !== undefined) return Promise.resolve(failedOn<A, E>(state.kernel, halt))
  return settled(state).then((done) => progressed(state, done))
}

const continued = <A, E>(
  state: Drive<A, E>,
  halted: RunResult<A, E> | undefined,
): Promise<
  RunResult<A, E>
> => (halted !== undefined ? Promise.resolve(halted) : drive({ ...state, guard: state.guard + 1 }))

const drive = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E>> =>
  iteration(state).then((halted) => continued(state, halted))

type KernelField<A = unknown> = A

const RUN_OPTION_KEYS: ReadonlyArray<string> = [
  'choose',
  'explore',
  'external',
  'interrupt',
  'maxSteps',
  'onQuiescent',
  'path',
  'quiescenceTurns',
  'stepTurns',
]

const isHostObject = (candidate: KernelField): candidate is object => typeof candidate === 'object'

const hasOptionKeys = (candidate: object): boolean =>
  Object.keys(candidate).every((key) => RUN_OPTION_KEYS.includes(key))

const isRunOptions = (candidate: KernelField): candidate is RunOptions =>
  isHostObject(candidate) && hasOptionKeys(candidate)

const isProgram = (candidate: KernelField): boolean => !isRunOptions(candidate)

/**
 * Runs one Effect program under one kernel (R2: every clock the program can
 * reach is the kernel's virtual root clock; R37: at quiescence the kernel
 * settles its test clocks, then advances the root clock). Driven by the
 * decision path or chooser in `options`, it returns the exit, the decisions
 * taken, and a per-step record of which fiber ran. A second run started while
 * one is active fails immediately instead of sharing the global hooks.
 */
const runKernelImpl = <A, E>(
  program: Effect.Effect<A, E>,
  options: RunOptions = {},
): Promise<RunResult<A, E>> => {
  rejectAwaitedExploration(options)
  const kernel = makeKernel({ exploring: options.explore !== 'body' })
  const recorder = installEscapeRecorder((escape) => {
    kernel.escapes.push(escape)
  })
  const userSeam = options.onQuiescent
  const root = Effect.runFork(
    Effect.provideService(program, Clock.Clock, kernel.clocks.clock),
    { scheduler: kernel.scheduler },
  )
  kernel.start(root)
  return drive<A, E>({
    kernel,
    root,
    options: { ...options, onQuiescent: () => stepClocks(kernel.clocks) || seamOffersProgress(userSeam) },
    before: resourceCounts(),
    guard: 0,
    hostImmediate: recorder.hostImmediate,
  }).finally(() => {
    recorder.restore()
    kernel.release()
  })
}
/** @internal */
export const runKernel: {
  <A, E>(program: Effect.Effect<A, E>, options?: RunOptions): Promise<RunResult<A, E>>
  (options?: RunOptions): <A, E>(program: Effect.Effect<A, E>) => Promise<RunResult<A, E>>
} = dual((args: IArguments): boolean => args.length > 0 && isProgram(args[0]), runKernelImpl)

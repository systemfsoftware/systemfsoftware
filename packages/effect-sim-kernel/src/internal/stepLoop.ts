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

import { stepClocks } from './clocks.js'
import { describeSuspended, newResources, resourceCounts, waitKindOf } from './deadlock.js'
import type { AnyFiber, SuspendedFiber, WaitKind } from './deadlock.js'
import { installEscapeRecorder } from './escapeRecorder.js'
import type { Escape, TimerName } from './escapeRecorder.js'
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
   * The decisions to take, one per explored step (R4). A shorter path falls
   * back to Effect's order for its remaining steps.
   */
  readonly path?: ReadonlyArray<Decision>
  /**
   * Chooses beyond the recorded path (seam for PCT and bounded search).
   * Returning undefined takes the zero-preemption choice.
   */
  readonly choose?: (choice: Choice) => Decision | undefined
  /** Interrupts one fiber at a chosen step (R5). */
  readonly interrupt?: Interruption
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

interface Drive<A, E> {
  readonly kernel: Kernel
  readonly root: AnyFiber<A, E>
  readonly options: RunOptions
  readonly before: ReadonlyMap<string, number>
  readonly guard: number
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

const escapeOrRunaway = (kernel: Kernel, options: RunOptions, guard: number): RunFailure | undefined => {
  const escaped = kernel.escapes[0]
  if (escaped !== undefined) return escapeFailureOf(escaped)
  return runawayOf(kernel, options, guard)
}

const quiescenceFailure = (kernel: Kernel, before: ReadonlyMap<string, number>): RunFailure => {
  const resources = newResources(before)
  if (resources.length === 0) {
    return { ...runOutcomeTags.deadlock, suspended: describeSuspended(kernel.fibers) }
  }
  return { ...runOutcomeTags.blocked, on: waitKindOf(resources), resources }
}

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

const seamOrFailure = <A, E>(state: Drive<A, E>): Promise<RunResult<A, E> | undefined> => {
  if (seamOffersProgress(state.options.onQuiescent)) return Promise.resolve(undefined)
  return Promise.resolve(failedOn<A, E>(state.kernel, quiescenceFailure(state.kernel, state.before)))
}

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

/**
 * Runs one Effect program under one kernel (R2: every clock the program can
 * reach is the kernel's virtual root clock; R37: at quiescence the kernel
 * settles its test clocks, then advances the root clock). Driven by the
 * decision path or chooser in `options`, it returns the exit, the decisions
 * taken, and a per-step record of which fiber ran. A second run started while
 * one is active fails immediately instead of sharing the global hooks.
 */
/** @internal */
export const runKernel = <A, E>(
  program: Effect.Effect<A, E>,
  options: RunOptions = {},
): Promise<RunResult<A, E>> => {
  const kernel = makeKernel({ exploring: options.explore !== 'body' })
  const restore = installEscapeRecorder((escape) => {
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
  }).finally(() => {
    restore()
    kernel.release()
  })
}

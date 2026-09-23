/**
 * The kernel instance (KTD2): it supplies Effect's `Scheduler`, wraps the fiber
 * resume methods, and observes `Ref` and `Deferred` field access. The hooks are
 * installed once per process and dispatch to the one running kernel; every other
 * piece of state lives on the instance, so each run owns its own kernel.
 *
 * The hooks read Effect runtime internals, which the plan allows only inside this
 * package (R17). They are pinned to `effect` 4.0.0-rc.116 and fail loudly when a
 * field or method moves.
 */
import { Deferred, Effect, Ref, Scheduler } from 'effect'

import type { AnyFiber } from './Deadlock.js'
import type { Escape } from './EscapeRecorder.js'

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

/** An index into the kernel's pending task list: the schedule's unit of choice. */
export type Decision = number

/** What the schedule can pick at one step, handed to a `choose` callback. */
export interface ChoiceOption {
  readonly fiberId: number | undefined
  /** The zero-preemption choice (Effect's dispatcher order). */
  readonly isDefault: boolean
  /** A Promise or microtask resume, queued between steps (R36). */
  readonly external: boolean
  /** The continuation of a fiber the kernel sliced. */
  readonly forced: boolean
}

export interface Choice {
  /** Zero-based index of this step among the explored decisions. */
  readonly index: number
  readonly options: ReadonlyArray<ChoiceOption>
}

export interface StepRecord {
  /** One-based step index. */
  readonly step: number
  readonly choice: Decision
  readonly options: number
  /** What the zero-preemption schedule would have picked at this step. */
  readonly fallback: Decision
  readonly deviation: boolean
  readonly forced: boolean
  readonly external: boolean
  /** The fiber that ran, as Effect numbered it. */
  readonly fiberId: number | undefined
  /**
   * The step touched state another fiber can observe — a `Ref` or `Deferred`
   * field, another fiber's task, or more than one scheduled task — so reordering
   * it can change the outcome. Seam for preemption-bounded search (pruning).
   */
  readonly visible: boolean
}

export interface Task {
  readonly owner: AnyFiber | undefined
  readonly run: () => void
  readonly external: boolean
  readonly forced: boolean
  readonly step: number
}

export interface StepInput {
  readonly choice: Decision
  readonly options: number
  readonly fallback: Decision
}

/** Which fiber an interruption names (R5). */
export type FiberTarget = 'root' | 'lastRan' | number

/**
 * `paused` is everywhere program code is not running inside a controlled step —
 * between steps, and while the loop drains microtasks. `step` is the controlled
 * execution of one task.
 */
export type Phase = 'paused' | 'step'

type MethodFunction = (this: AnyFiber, ...args: ReadonlyArray<Field>) => Field

const CURRENT_FIBER = '~effect/Fiber/currentFiber'

// The fiber methods the kernel wraps: `evaluate` intercepts resumes that would
// otherwise run inline outside every decision; the other three observe a fiber
// reaching into another fiber's task.
const FIBER_METHODS = ['addObserver', 'interruptUnsafe', 'pollUnsafe', 'evaluate'] as const

export type FiberMethod = (typeof FIBER_METHODS)[number]

const REF_FIELDS = ['ref'] as const
const DEFERRED_FIELDS = ['effect', 'resumes'] as const

const isFiberLike = (candidate: Field): candidate is AnyFiber => typeof candidate === 'object'
const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object'
const isMethod = (candidate: Field): candidate is MethodFunction => typeof candidate === 'function'

const fieldOf = (target: object, key: string): Field => Reflect.get(target, key)

const methodOf = (target: object, name: string): MethodFunction | undefined => {
  const candidate: Field = fieldOf(target, name)
  return isMethod(candidate) ? candidate : undefined
}

const dispatcherOf = (fiber: AnyFiber): Field => fieldOf(fiber, 'currentDispatcher')

const protoOf = (value: object): object => {
  const proto: Field = Object.getPrototypeOf(value)
  return isHostObject(proto) ? proto : Object.prototype
}

const currentFiber = (): AnyFiber | undefined => {
  const current: Field = Reflect.get(globalThis, CURRENT_FIBER)
  return isFiberLike(current) ? current : undefined
}

// ---------------------------------------------------------------------------
// The one-time global hooks
// ---------------------------------------------------------------------------

let installed = false
let live: Kernel | undefined

export const currentKernel = (): Kernel | undefined => live

/**
 * `Ref` and `Deferred` keep their state in own data fields, so a getter on the
 * prototype only takes effect for instances created after it is defined: the
 * class-field assignment then goes through the setter and every later read
 * through the getter. Instances created before installation are simply
 * unobserved. The value moves into a symbol slot so behaviour is unchanged.
 */
const interceptField = (proto: object, field: string): void => {
  const slot = Symbol(field)
  Object.defineProperty(proto, field, {
    configurable: true,
    get(this: Record<symbol, Field>): Field {
      live?.observeShared(this)
      return this[slot]
    },
    set(this: Record<symbol, Field>, value: Field): void {
      live?.observeShared(this)
      this[slot] = value
    },
  })
}

const interceptFields = (proto: object, fields: ReadonlyArray<string>): void => {
  for (const field of fields) interceptField(proto, field)
}

const resumingKernel = (fiber: AnyFiber, kernel: Kernel | undefined): Kernel | undefined =>
  kernel === undefined ? undefined : resumableKernel(fiber, kernel)

const resumableKernel = (fiber: AnyFiber, kernel: Kernel): Kernel | undefined =>
  isResumableBy(fiber, kernel) ? kernel : undefined

const isResumableBy = (fiber: AnyFiber, kernel: Kernel): boolean =>
  fiber.pollUnsafe() === undefined && dispatcherOf(fiber) === kernel.dispatcher

const isOtherFiber = (running: AnyFiber | undefined, fiber: AnyFiber): boolean =>
  running !== undefined && running !== fiber

const applyOriginal = (
  original: MethodFunction,
  fiber: AnyFiber,
  args: ReadonlyArray<Field>,
): Field => Reflect.apply(original, fiber, args)

const dispatchEvaluate = (
  fiber: AnyFiber,
  kernel: Kernel | undefined,
  original: MethodFunction,
  args: ReadonlyArray<Field>,
): Field => {
  const active = resumingKernel(fiber, kernel)
  if (active !== undefined) {
    // A Promise or microtask resuming a kernel fiber while no step is running
    // would execute it inline, outside every decision: queue it as a kernel task
    // so it becomes the next step's scheduling choice (R36). The root fiber's
    // first slice runs before `start()` claims the hooks, so it stays inline,
    // the way Effect itself would run it.
    active.resumeExternally(fiber, () => applyOriginal(original, fiber, args))
    return undefined
  }
  return dispatchObserved(fiber, kernel, original, args)
}

const dispatchObserved = (
  fiber: AnyFiber,
  kernel: Kernel | undefined,
  original: MethodFunction,
  args: ReadonlyArray<Field>,
): Field => {
  noteOtherFiberWork(fiber, kernel)
  return applyOriginal(original, fiber, args)
}

const dispatchFiberCall = (
  fiber: AnyFiber,
  method: FiberMethod,
  original: MethodFunction,
  args: ReadonlyArray<Field>,
): Field => (method === 'evaluate'
  ? dispatchEvaluate(fiber, live, original, args)
  : dispatchObserved(fiber, live, original, args))

const noteOtherFiberWork = (fiber: AnyFiber, kernel: Kernel | undefined): void => {
  // A fiber reaching into another fiber's task is shared work.
  if (isOtherFiber(currentFiber(), fiber)) observeOtherWork(kernel, fiber)
}

const observeOtherWork = (kernel: Kernel | undefined, fiber: AnyFiber): void => {
  if (kernel === undefined) return
  kernel.observeShared(fiber)
  kernel.observeGlobalWork()
}

const override = (proto: object, method: FiberMethod): void => {
  const original = methodOf(proto, method)
  if (original === undefined) {
    throw new Error(`effect-sim-kernel: FiberImpl.${method} is missing on the pinned Effect version`)
  }
  Object.defineProperty(proto, method, {
    configurable: true,
    value: function(this: AnyFiber, ...args: ReadonlyArray<Field>): Field {
      return dispatchFiberCall(this, method, original, args)
    },
  })
}

const overrideAll = (proto: object): void => {
  for (const method of FIBER_METHODS) override(proto, method)
}

const installHooks = (): void => {
  if (installed) return
  installed = true
  interceptFields(protoOf(Ref.makeUnsafe(0)), REF_FIELDS)
  interceptFields(protoOf(Deferred.makeUnsafe()), DEFERRED_FIELDS)
  overrideAll(protoOf(Effect.runFork(Effect.void)))
}

// ---------------------------------------------------------------------------
// The kernel
// ---------------------------------------------------------------------------

export interface Kernel {
  readonly pending: ReadonlyArray<Task>
  readonly fibers: ReadonlySet<AnyFiber>
  readonly steps: ReadonlyArray<StepRecord>
  /** The decisions the schedule explored, in order (R4's replayable path). */
  readonly decisions: ReadonlyArray<Decision>
  readonly escapes: Array<Escape>
  readonly scheduler: Scheduler.Scheduler
  readonly dispatcher: Scheduler.SchedulerDispatcher
  readonly phase: Phase
  /** When false, decisions stay on Effect's order until `beginExploration` (R15). */
  readonly exploring: boolean
  /** Claims the global hooks for this run and remembers the root fiber. */
  start(root: AnyFiber): void
  release(): void
  /** From here on, the schedule may deviate from Effect's order (R15). */
  beginExploration(): void
  /** What Effect's own dispatcher would run next. */
  effectDefault(): Decision
  step(input: StepInput): void
  resumeExternally(fiber: AnyFiber, run: () => void): void
  observeShared(target: object): void
  observeGlobalWork(): void
  resolveTarget(target: FiberTarget): AnyFiber | undefined
  /** Interrupts one fiber (R5). Its finalizers run as later steps. */
  interrupt(fiber: AnyFiber): void
}

export interface MakeKernelOptions {
  /** When false, decisions stay on Effect's order until `beginExploration`. */
  readonly exploring: boolean
}

export const makeKernel = (options: MakeKernelOptions): Kernel => {
  installHooks()
  const pending: Array<Task> = []
  const fibers = new Set<AnyFiber>()
  const steps: Array<StepRecord> = []
  const decisions: Array<Decision> = []
  const escapes: Array<Escape> = []
  const touches = new Set<object>()
  /**
   * The limit starts at one operation so every adjacent primitive is separated
   * by a step; after the kernel itself slices a fiber, its next slice gets two,
   * because resuming from a yield spends runtime operations on bookkeeping.
   */
  const limit = new WeakMap<AnyFiber, number>()
  const yieldedByUs = new WeakSet<AnyFiber>()

  let phase: Phase = 'paused'
  let exploring = options.exploring
  let stepCount = 0
  let scheduledInStep = 0
  let globalWorkThisStep = false
  let ranInTask: AnyFiber | undefined = undefined
  let lastRan: AnyFiber | undefined = undefined
  let forcing: AnyFiber | undefined = undefined
  let root: AnyFiber | undefined = undefined

  const taskAt = (index: Decision): Task | undefined => pending[index]
  const stepOn = (task: Task | undefined): number => (task === undefined ? -1 : task.step)
  const stepAt = (index: Decision): number => stepOn(taskAt(index))
  const isForcedTask = (task: Task | undefined): boolean => task !== undefined && task.forced
  const laterThan = (best: Decision, index: Decision): boolean => stepAt(index) > stepAt(best)

  const laterForced = (best: Decision, index: Decision, task: Task | undefined): Decision => {
    if (keepsBest(best, index, task)) return best
    return index
  }

  const keepsBest = (best: Decision, index: Decision, task: Task | undefined): boolean =>
    !isForcedTask(task) || !laterThan(best, index)

  const latestForcedIndex = (): Decision => {
    let best = -1
    for (const [index, task] of pending.entries()) best = laterForced(best, index, task)
    return best
  }

  const isExternalTask = (task: Task): boolean => task.external

  const firstExternalIndex = (): Decision => {
    const found = pending.findIndex(isExternalTask)
    return found >= 0 ? found : 0
  }

  /**
   * What Effect's own dispatcher would run next: the continuation the kernel
   * sliced in the latest step goes first (Effect keeps running a fiber until it
   * yields, so that continuation is what Effect would have kept running); then a
   * fiber woken by a Promise or microtask, which runs in the microtask
   * checkpoint ahead of the next dispatcher batch; then the oldest task.
   */
  const effectDefault = (): Decision => {
    const forced = latestForcedIndex()
    return forced >= 0 ? forced : firstExternalIndex()
  }

  const seedLimit = (fiber: AnyFiber): void => {
    limit.set(fiber, yieldedByUs.has(fiber) ? 2 : 1)
    yieldedByUs.delete(fiber)
  }

  const seededLimit = (fiber: AnyFiber): number | undefined => {
    if (fiber.currentOpCount !== 1) return limit.get(fiber)
    seedLimit(fiber)
    return limit.get(fiber)
  }

  const opLimitOf = (fiber: AnyFiber): number => seededLimit(fiber) ?? 1

  const opLimitExceeded = (fiber: AnyFiber): boolean => fiber.currentOpCount > opLimitOf(fiber)

  const noteFirstRan = (fiber: AnyFiber): void => {
    if (ranInTask === undefined) ranInTask = fiber
  }

  const noteYieldedByUs = (fiber: AnyFiber): void => {
    yieldedByUs.add(fiber)
    forcing = fiber
  }

  const shouldYield = (fiber: AnyFiber): boolean => {
    fibers.add(fiber)
    noteFirstRan(fiber)
    if (opLimitExceeded(fiber)) {
      noteYieldedByUs(fiber)
      return true
    }
    return false
  }

  const isForcing = (owner: AnyFiber | undefined): boolean => owner !== undefined && owner === forcing

  const scheduleTask = (task: () => void, _priority: number): void => {
    const owner = currentFiber()
    const forced = isForcing(owner)
    if (forced) forcing = undefined
    pending.push({ owner, run: task, external: false, forced, step: stepCount })
    scheduledInStep++
  }

  const dispatcher: Scheduler.SchedulerDispatcher = {
    scheduleTask,
    flush: (): void => {},
  }

  const scheduler: Scheduler.Scheduler = {
    executionMode: 'sync',
    shouldYield,
    makeDispatcher: () => dispatcher,
  }

  const beginStep = (): void => {
    stepCount++
    ranInTask = undefined
    scheduledInStep = 0
    globalWorkThisStep = false
    touches.clear()
    phase = 'step'
  }

  const endStep = (): void => {
    phase = 'paused'
  }

  const ranOn = (task: Task): AnyFiber | undefined => ranInTask ?? task.owner

  const runTask = (task: Task): AnyFiber | undefined => {
    beginStep()
    try {
      task.run()
    } finally {
      endStep()
    }
    return ranOn(task)
  }

  const touchesFiber = (ran: AnyFiber | undefined): boolean => ran !== undefined && touches.has(ran)

  const extraScheduling = (): boolean => scheduledInStep > 1 || globalWorkThisStep

  const sharedWork = (ran: AnyFiber | undefined): boolean => extraScheduling() || touchesFiber(ran)

  const isVisible = (task: Task, ran: AnyFiber | undefined): boolean => task.external || sharedWork(ran)

  const stepRecord = (input: StepInput, task: Task, ran: AnyFiber | undefined): StepRecord => ({
    step: stepCount,
    choice: input.choice,
    options: input.options,
    fallback: input.fallback,
    deviation: input.choice !== input.fallback,
    forced: task.forced,
    external: task.external,
    fiberId: ran?.id,
    visible: isVisible(task, ran),
  })

  const recordStep = (input: StepInput, task: Task, ran: AnyFiber | undefined): void => {
    lastRan = ran
    steps.push(stepRecord(input, task, ran))
    if (exploring) decisions.push(input.choice)
  }

  const takeTask = (choice: Decision): Task | undefined => {
    const task = taskAt(choice)
    if (task === undefined) return undefined
    pending.splice(choice, 1)
    return task
  }

  const step = (input: StepInput): void => {
    const task = takeTask(input.choice)
    if (task === undefined) {
      throw new Error(`effect-sim-kernel: no task to run at decision ${input.choice}`)
    }
    const ran = runTask(task)
    recordStep(input, task, ran)
  }

  const sharesId = (id: number) => (candidate: AnyFiber): boolean => candidate.id === id

  const fiberWithId = (id: number): AnyFiber | undefined => [...fibers].find(sharesId(id))

  const namedTarget = (target: 'lastRan' | number): AnyFiber | undefined =>
    target === 'lastRan' ? lastRan : fiberWithId(target)

  const targetFiber = (target: FiberTarget): AnyFiber | undefined => target === 'root' ? root : namedTarget(target)

  const isUnfinished = (fiber: AnyFiber | undefined): boolean => fiber !== undefined && fiber.pollUnsafe() === undefined

  const unfinished = (fiber: AnyFiber | undefined): AnyFiber | undefined => isUnfinished(fiber) ? fiber : undefined

  const kernel: Kernel = {
    pending,
    fibers,
    steps,
    decisions,
    escapes,
    scheduler,
    dispatcher,
    get phase(): Phase {
      return phase
    },
    get exploring(): boolean {
      return exploring
    },
    start: (started: AnyFiber): void => {
      root = started
      live = kernel
    },
    release: (): void => {
      live = undefined
    },
    beginExploration: (): void => {
      exploring = true
    },
    effectDefault,
    step,
    resumeExternally: (fiber: AnyFiber, run: () => void): void => {
      pending.push({ owner: fiber, run, external: true, forced: false, step: stepCount })
      scheduledInStep++
    },
    observeShared: (target: object): void => {
      if (phase === 'step') touches.add(target)
    },
    observeGlobalWork: (): void => {
      if (phase === 'step') globalWorkThisStep = true
    },
    resolveTarget: (target: FiberTarget): AnyFiber | undefined => unfinished(targetFiber(target)),
    interrupt: (fiber: AnyFiber): void => {
      methodOf(fiber, 'interruptUnsafe')?.call(fiber)
    },
  }
  return kernel
}

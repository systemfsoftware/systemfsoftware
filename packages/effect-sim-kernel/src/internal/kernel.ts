/**
 * The kernel instance (KTD2): it supplies Effect's `Scheduler`, wraps the fiber
 * resume methods, and observes `Ref` and `Deferred` field access. The hooks are
 * acquired for the lifetime of one run and restored when the run releases them:
 * the patched wrappers close over their kernel, a fiber's `currentDispatcher`
 * carries that kernel's dispatcher, and a module-private slot on the patched
 * fiber prototype marks the one active run for the concurrency guard. No
 * module-level mutable state survives a release.
 *
 * The hooks read Effect runtime internals, which the plan allows only inside this
 * package (R17). They are pinned to `effect` 4.0.0-rc.116 and fail loudly when a
 * field or method moves.
 */
import { Deferred, Effect, Ref, Scheduler } from 'effect'

import { makeRunClocks } from './clocks.js'
import type { RunClocks } from './clocks.js'
import type { AnyFiber } from './deadlock.js'
import type { Escape } from './escapeRecorder.js'
import { claimRun, isRunLive, releaseRun } from './runMark.js'

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

/** An index into the kernel's pending task list: the schedule's unit of choice. */
/** @internal */
export type Decision = number

/** What the schedule can pick at one step, handed to a `choose` callback. */
/** @internal */
export interface ChoiceOption {
  readonly fiberId: number | undefined
  /** The zero-preemption choice (Effect's dispatcher order). */
  readonly isDefault: boolean
  /** A Promise or microtask resume, queued between steps (R36). */
  readonly external: boolean
  /** The continuation of a fiber the kernel sliced. */
  readonly forced: boolean
}

/** @internal */
export interface Choice {
  /** Zero-based index of this step among the explored decisions. */
  readonly index: number
  readonly options: ReadonlyArray<ChoiceOption>
}

/** @internal */
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

/** @internal */
export interface Task {
  readonly owner: AnyFiber | undefined
  readonly run: () => void
  readonly external: boolean
  readonly forced: boolean
  readonly step: number
}

/** @internal */
export interface StepInput {
  readonly choice: Decision
  readonly options: number
  readonly fallback: Decision
}

/** Which fiber an interruption names (R5). */
/** @internal */
export type FiberTarget = 'root' | 'lastRan' | number

/**
 * `paused` is everywhere program code is not running inside a controlled step —
 * between steps, and while the loop drains microtasks. `step` is the controlled
 * execution of one task.
 */
/** @internal */
export type Phase = 'paused' | 'step'

type MethodFunction = (this: AnyFiber, ...args: ReadonlyArray<Field>) => Field

const CURRENT_FIBER = '~effect/Fiber/currentFiber'

// The fiber methods the kernel wraps: `evaluate` intercepts resumes that would
// otherwise run inline outside every decision; the other three observe a fiber
// reaching into another fiber's task.
const FIBER_METHODS = ['addObserver', 'interruptUnsafe', 'pollUnsafe', 'evaluate'] as const

const REF_FIELDS = ['ref'] as const
const DEFERRED_FIELDS = ['effect', 'resumes'] as const

const isFiberLike = (candidate: Field): candidate is AnyFiber => typeof candidate === 'object'
const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object'
const isMethod = (candidate: Field): candidate is MethodFunction => typeof candidate === 'function'

const fieldOf = (target: object, key: string | symbol): Field => Reflect.get(target, key)

const methodOf = (target: object, name: string): MethodFunction | undefined => {
  const candidate: Field = fieldOf(target, name)
  return isMethod(candidate) ? candidate : undefined
}

const dispatcherOf = (fiber: AnyFiber): Field => fieldOf(fiber, 'currentDispatcher')

const protoOf = (value: object): object => {
  const proto: Field = Object.getPrototypeOf(value)
  return isHostObject(proto) ? proto : Object.prototype
}

const fiberPrototype = (): object => protoOf(Effect.runFork(Effect.void))

// ---------------------------------------------------------------------------
// Hook acquisition and release
// ---------------------------------------------------------------------------

const captureDescriptor = (proto: object, field: string): PropertyDescriptor | undefined => {
  const descriptor: Field = Reflect.getOwnPropertyDescriptor(proto, field)
  return isHostObject(descriptor) ? descriptor : undefined
}

const descriptorEntryOf = (
  proto: object,
  field: string,
): readonly [string, PropertyDescriptor] | undefined => {
  const descriptor = captureDescriptor(proto, field)
  return descriptor === undefined ? undefined : [field, descriptor]
}

const captureDescriptors = (
  proto: object,
  fields: ReadonlyArray<string>,
): ReadonlyArray<readonly [string, PropertyDescriptor]> =>
  fields
    .map((field) => descriptorEntryOf(proto, field))
    .filter((entry): entry is readonly [string, PropertyDescriptor] => entry !== undefined)

const slotOf = (field: string): symbol => Symbol.for(`~effect-sim-kernel/field/${field}`)

const passThroughField = (proto: object, field: string): void => {
  const slot = slotOf(field)
  Reflect.defineProperty(proto, field, {
    configurable: true,
    get(this: Record<symbol, Field>): Field {
      return this[slot]
    },
    set(this: Record<symbol, Field>, value: Field): void {
      this[slot] = value
    },
  })
}

const restoreField = (
  proto: object,
  field: string,
  captured: ReadonlyArray<readonly [string, PropertyDescriptor]>,
): void => {
  const original = captured.find((entry) => entry[0] === field)
  if (original === undefined) passThroughField(proto, field)
  else Reflect.defineProperty(proto, original[0], original[1])
}

const restoreFields = (
  proto: object,
  fields: ReadonlyArray<string>,
  captured: ReadonlyArray<readonly [string, PropertyDescriptor]>,
): void => {
  for (const field of fields) restoreField(proto, field, captured)
}

const patchMethod = (
  proto: object,
  entry: readonly [string, MethodFunction],
  kernel: Kernel,
): void => {
  Reflect.defineProperty(proto, entry[0], {
    configurable: true,
    value: function(this: AnyFiber, ...args: ReadonlyArray<Field>): Field {
      return dispatchFiberCall(this, entry[0], entry[1], args, kernel)
    },
    writable: true,
  })
}

const patchMethods = (
  proto: object,
  originals: ReadonlyArray<readonly [string, MethodFunction]>,
  kernel: Kernel,
): void => {
  for (const entry of originals) patchMethod(proto, entry, kernel)
}

const restoreMethod = (proto: object, entry: readonly [string, MethodFunction]): void => {
  Reflect.defineProperty(proto, entry[0], { configurable: true, value: entry[1], writable: true })
}

const restoreMethods = (
  proto: object,
  originals: ReadonlyArray<readonly [string, MethodFunction]>,
): void => {
  for (const entry of originals) restoreMethod(proto, entry)
}

const missingMethod = (name: string): never => {
  throw new Error(`effect-sim-kernel: FiberImpl.${name} is missing on the pinned Effect version`)
}

const originalMethodOf = (proto: object, name: string): MethodFunction => {
  const original = methodOf(proto, name)
  return original === undefined ? missingMethod(name) : original
}

const originalOf = (
  proto: object,
  name: string,
): readonly [string, MethodFunction] => [name, originalMethodOf(proto, name)]

const originalMethodsOf = (proto: object): ReadonlyArray<readonly [string, MethodFunction]> =>
  FIBER_METHODS.map((name) => originalOf(proto, name))

const interceptField = (proto: object, field: string, guard: (target: object) => void): void => {
  const slot = slotOf(field)
  Reflect.defineProperty(proto, field, {
    configurable: true,
    get(this: Record<symbol, Field>): Field {
      guard(this)
      return this[slot]
    },
    set(this: Record<symbol, Field>, value: Field): void {
      guard(this)
      this[slot] = value
    },
  })
}

const interceptFields = (
  proto: object,
  fields: ReadonlyArray<string>,
  guard: (target: object) => void,
): void => {
  for (const field of fields) interceptField(proto, field, guard)
}

/**
 * Claims the hooks for one run: the fiber methods and the `Ref` and `Deferred`
 * fields are patched with closures over this kernel, and the live run is
 * marked. The returned restore undoes both and runs exactly once, at release.
 */
const acquireHooks = (kernel: Kernel): () => void => {
  if (isRunLive()) {
    throw new Error('effect-sim-kernel: a kernel run is already active — one kernel owns the global hooks at a time')
  }
  const fiberProto = fiberPrototype()
  const originals = originalMethodsOf(fiberProto)
  const refProto = protoOf(Ref.makeUnsafe(0))
  const deferredProto = protoOf(Deferred.makeUnsafe())
  const capturedRef = captureDescriptors(refProto, REF_FIELDS)
  const capturedDeferred = captureDescriptors(deferredProto, DEFERRED_FIELDS)
  const guard = (target: object): void => {
    if (kernel.running) kernel.observeShared(target)
  }
  claimRun(kernel)
  patchMethods(fiberProto, originals, kernel)
  interceptFields(refProto, REF_FIELDS, guard)
  interceptFields(deferredProto, DEFERRED_FIELDS, guard)
  return () => {
    releaseRun()
    restoreMethods(fiberProto, originals)
    restoreFields(refProto, REF_FIELDS, capturedRef)
    restoreFields(deferredProto, DEFERRED_FIELDS, capturedDeferred)
  }
}

// ---------------------------------------------------------------------------
// Dispatch through the instance
// ---------------------------------------------------------------------------

const currentFiber = (): AnyFiber | undefined => {
  const current: Field = Reflect.get(globalThis, CURRENT_FIBER)
  return isFiberLike(current) ? current : undefined
}

const applyOriginal = (
  original: MethodFunction,
  fiber: AnyFiber,
  args: ReadonlyArray<Field>,
): Field => Reflect.apply(original, fiber, args)

const isOtherFiber = (running: AnyFiber | undefined, fiber: AnyFiber): boolean =>
  running !== undefined && running !== fiber

const noteOtherFiberWork = (fiber: AnyFiber, kernel: Kernel): void => {
  // A fiber reaching into another fiber's task is shared work.
  if (isOtherFiber(currentFiber(), fiber)) {
    kernel.observeShared(fiber)
    kernel.observeGlobalWork()
  }
}

const dispatchObserved = (
  fiber: AnyFiber,
  kernel: Kernel,
  original: MethodFunction,
  args: ReadonlyArray<Field>,
): Field => {
  noteOtherFiberWork(fiber, kernel)
  return applyOriginal(original, fiber, args)
}

const isResumableBy = (fiber: AnyFiber, kernel: Kernel): boolean =>
  fiber.pollUnsafe() === undefined && dispatcherOf(fiber) === kernel.dispatcher

const isResumingRun = (fiber: AnyFiber, kernel: Kernel): boolean => kernel.running && isResumableBy(fiber, kernel)

const resumeExternallyThrough = (
  fiber: AnyFiber,
  kernel: Kernel,
  original: MethodFunction,
  args: ReadonlyArray<Field>,
): undefined => {
  // A Promise or microtask resuming a kernel fiber while no step is running
  // would execute it inline, outside every decision: queue it as a kernel task
  // so it becomes the next step's scheduling choice (R36). The root fiber's
  // first slice runs before `start` claims the run, so it stays inline, the way
  // Effect itself would run it.
  kernel.resumeExternally(fiber, () => applyOriginal(original, fiber, args))
  return undefined
}

const dispatchEvaluate = (
  fiber: AnyFiber,
  kernel: Kernel,
  original: MethodFunction,
  args: ReadonlyArray<Field>,
): Field => {
  if (isResumingRun(fiber, kernel)) return resumeExternallyThrough(fiber, kernel, original, args)
  return dispatchObserved(fiber, kernel, original, args)
}

const dispatchFiberCall = (
  fiber: AnyFiber,
  method: string,
  original: MethodFunction,
  args: ReadonlyArray<Field>,
  kernel: Kernel,
): Field => (method === 'evaluate'
  ? dispatchEvaluate(fiber, kernel, original, args)
  : dispatchObserved(fiber, kernel, original, args))

// ---------------------------------------------------------------------------
// The kernel
// ---------------------------------------------------------------------------

/** @internal */
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
  /** The clocks this run owns: the virtual root clock and its test clocks (R2, R37). */
  readonly clocks: RunClocks
  /** The root fiber once `start` claimed the run; undefined before it. */
  readonly root: AnyFiber | undefined
  /** Whether `start` has claimed the run; gates wrapper interception. */
  readonly running: boolean
  /** Marks the run as claimed and remembers the root fiber. */
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
  /** Records a primitive the run reached without observing it (pruning seam). */
  unobserved(name: string): void
  /** Drains the recorded names; each run's records are read once. */
  takeUnobserved(): ReadonlyArray<string>
  resolveTarget(target: FiberTarget): AnyFiber | undefined
  /** Interrupts one fiber (R5). Its finalizers run as later steps. */
  interrupt(fiber: AnyFiber): void
  /**
   * Stops recording real-timer escapes until the run ends. The await path
   * yields to the host clock to let file and socket waits settle; those
   * yields are the kernel's own machinery, never the program escaping (R2).
   */
  pauseEscapes(): void
}

/** @internal */
export interface MakeKernelOptions {
  /** When false, decisions stay on Effect's order until `beginExploration`. */
  readonly exploring: boolean
}

/** @internal */
export const makeKernel = (options: MakeKernelOptions): Kernel => {
  const pending: Array<Task> = []
  const fibers = new Set<AnyFiber>()
  const steps: Array<StepRecord> = []
  const decisions: Array<Decision> = []
  const escapes: Array<Escape> = []
  const touches = new Set<object>()
  const unobservedNames = new Set<string>()
  const clocks = makeRunClocks()
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
  let running = false
  let restoreHooks: (() => void) | undefined = undefined

  const taskAt = (index: Decision): Task | undefined => pending[index]
  const stepOn = (task: Task | undefined): number => (task === undefined ? -1 : task.step)
  const stepAt = (index: Decision): number => stepOn(taskAt(index))
  const isForcedTask = (task: Task | undefined): boolean => task !== undefined && task.forced
  const laterThan = (best: Decision, index: Decision): boolean => stepAt(index) > stepAt(best)

  const keepsBest = (best: Decision, index: Decision, task: Task | undefined): boolean =>
    !isForcedTask(task) || !laterThan(best, index)

  const laterForced = (best: Decision, index: Decision, task: Task | undefined): Decision => {
    if (keepsBest(best, index, task)) return best
    return index
  }

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

  const release = (): void => {
    running = false
    if (restoreHooks !== undefined) restoreHooks()
    restoreHooks = undefined
  }

  const kernel: Kernel = {
    pending,
    fibers,
    steps,
    decisions,
    escapes,
    scheduler,
    dispatcher,
    clocks,
    get phase(): Phase {
      return phase
    },
    get exploring(): boolean {
      return exploring
    },
    get root(): AnyFiber | undefined {
      return root
    },
    get running(): boolean {
      return running
    },
    start: (started: AnyFiber): void => {
      root = started
      running = true
    },
    release,
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
    unobserved: (name: string): void => {
      unobservedNames.add(name)
    },
    takeUnobserved: (): ReadonlyArray<string> => {
      const found = [...unobservedNames].sort()
      unobservedNames.clear()
      return found
    },
    resolveTarget: (target: FiberTarget): AnyFiber | undefined => unfinished(targetFiber(target)),
    interrupt: (fiber: AnyFiber): void => {
      methodOf(fiber, 'interruptUnsafe')?.call(fiber)
    },
    pauseEscapes: (): void => {
      escapes.length = 0
    },
  }
  restoreHooks = acquireHooks(kernel)
  return kernel
}

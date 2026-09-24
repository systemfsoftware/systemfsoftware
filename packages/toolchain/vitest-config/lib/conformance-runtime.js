/**
 * The in-worker half of conformance coverage. Instrumented source calls `at`
 * around every primitive site, and each checker's `Kernel.run`/`Kernel.search`
 * call is wrapped in `during`.
 *
 * A site's execution is credited to the check whose kernel run executed it.
 * Tests in a file run concurrently, so "every check running at that moment"
 * would credit a plain test's site hit to a check that merely happened to be
 * exploring meanwhile. The kernel runs one task per step, synchronously, and
 * holds at most one live run per process, so a hit is credited only while the
 * live kernel reports it is inside a step; a plain test's fibers run between
 * steps and earn no check credit. A kernel that does not report its step phase
 * falls back to crediting during the whole run.
 *
 * Recording never adds an Effect operation: the kernel slices fibers by
 * operation, so an extra `Effect.suspend` would move every step the kernel
 * explores. Every hit is a plain function call:
 *
 *  - `effect`/`value` sites count when called — inside a generator or a
 *    `flatMap` callback that is when the program reaches them;
 *  - `inner` sites (Layer and Stream constructors) count when the runtime
 *    builds the Layer or calls a function the site was handed, never when the
 *    Layer or Stream value is merely constructed.
 */

/** @typedef {{ ran: number, checks: Record<string, number> }} Tally */
/** @typedef {(...args: Array<unknown>) => unknown} AnyFunction */

/** @type {{ sites: Map<string, Tally>, active: Map<string, number>, live: KernelLike | undefined }} */
const state = { sites: new Map(), active: new Map(), live: undefined }

/**
 * The shape a checker's `Kernel` namespace answers the step question with:
 * `isStepping()` or a `stepping` boolean. Absent on a kernel too old to report
 * it, and then a hit is credited for the whole run as before.
 * @typedef {{ isStepping?: () => boolean, stepping?: boolean }} KernelLike
 */

/**
 * Whether the live kernel is inside a synchronous step right now. Between steps
 * the kernel is paused, which is exactly when another test's fibers run.
 * @returns {boolean}
 */
const stepping = () => {
  const kernel = state.live
  if (kernel === undefined) return state.active.size > 0
  if (typeof kernel.isStepping === 'function') return kernel.isStepping() === true
  if (typeof kernel.stepping === 'boolean') return kernel.stepping === true
  return true
}

/**
 * @param {string} id
 * @returns {Tally}
 */
const tallyOf = (id) => {
  const found = state.sites.get(id)
  if (found !== undefined) return found
  /** @type {Tally} */
  const fresh = { ran: 0, checks: {} }
  state.sites.set(id, fresh)
  return fresh
}

/** @param {string} id */
const hit = (id) => {
  const tally = tallyOf(id)
  tally.ran += 1
  if (!stepping()) return
  for (const [check, depth] of state.active) {
    if (depth > 0) tally.checks[check] = (tally.checks[check] ?? 0) + 1
  }
}

/**
 * @param {unknown} value
 * @returns {value is AnyFunction}
 */
const isFunction = (value) => typeof value === 'function'

/**
 * @param {unknown} value
 * @returns {value is PromiseLike<unknown>}
 */
const isThenable = (value) =>
  typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'

/**
 * @param {unknown} value
 * @returns {value is { build: AnyFunction }}
 */
const isBuildable = (value) =>
  typeof value === 'object' && value !== null && 'build' in value && typeof value.build === 'function'

/**
 * @param {string} id
 * @param {AnyFunction} fn
 * @returns {AnyFunction}
 */
const onCall = (id, fn) =>
  /**
   * @this {unknown}
   * @param {...unknown} args
   */
  function(...args) {
    hit(id)
    return Reflect.apply(fn, this, args)
  }

/**
 * The same Layer, counting when the runtime builds it. `build` keeps the
 * original as its receiver, so a memoized Layer stays keyed on itself.
 * @param {string} id
 * @param {{ build: AnyFunction }} layer
 * @returns {object}
 */
const countingBuild = (id, layer) => {
  const copy = Object.create(Object.getPrototypeOf(layer), Object.getOwnPropertyDescriptors(layer))
  Object.defineProperty(copy, 'build', {
    configurable: true,
    writable: true,
    value: onCall(id, (...args) => Reflect.apply(layer.build, layer, args)),
  })
  return copy
}

/**
 * @param {string} id
 * @param {AnyFunction} fn
 * @returns {AnyFunction}
 */
const innerCall = (id, fn) =>
  /**
   * @this {unknown}
   * @param {...unknown} args
   */
  function(...args) {
    const handed = args.map((arg) => (isFunction(arg) ? onCall(id, arg) : arg))
    const out = Reflect.apply(fn, this, handed)
    if (isFunction(out)) return innerCall(id, out)
    return isBuildable(out) ? countingBuild(id, out) : out
  }

/**
 * @template A
 * @param {string} id
 * @param {string} mode
 * @param {A} value
 * @returns {A}
 */
export const at = (id, mode, value) => {
  if (!isFunction(value)) {
    hit(id)
    return value
  }
  /** Same callable, instrumented: the site's own type is unchanged. */
  const instrumented =
    /** @type {A} */ (/** @type {unknown} */ (mode === 'inner' ? innerCall(id, value) : onCall(id, value)))
  return instrumented
}

/**
 * Runs `start` with `check` active until the kernel run it returns settles, and
 * remembers the kernel's namespace so `hit` can ask whether a step is executing.
 * A module transformed before the kernel was handed over calls this with two
 * arguments; the second is then the start function and no step phase is known,
 * which credits the whole run as before rather than throwing.
 * @template A
 * @param {string} check
 * @param {KernelLike | (() => A)} kernel
 * @param {(() => A) | undefined} [start]
 * @returns {A | Promise<A>}
 */
export const during = (check, kernel, start) => {
  const handedKernel = start !== undefined
  const run = /** @type {() => A} */ (handedKernel ? start : kernel)
  state.active.set(check, (state.active.get(check) ?? 0) + 1)
  const previous = state.live
  const live = handedKernel ? /** @type {KernelLike} */ (kernel) : undefined
  state.live = live
  const leave = () => {
    state.active.set(check, (state.active.get(check) ?? 1) - 1)
    if (state.live === live) state.live = previous
  }
  try {
    const out = run()
    if (!isThenable(out)) {
      leave()
      return out
    }
    /** The kernel's promise, with the check left when it settles either way. */
    const settled = /** @type {Promise<A>} */ (Promise.resolve(out).finally(leave))
    return settled
  } catch (cause) {
    leave()
    throw cause
  }
}

/** @returns {Record<string, Tally>} */
export const drain = () => {
  const out = Object.fromEntries(state.sites)
  state.sites.clear()
  return out
}

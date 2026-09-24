/**
 * Real-timer escape recording (R2). While a kernel run is live, the global timer
 * functions report every call with the call site that made it, so a program that
 * reaches a real timer fails the run with a named site. `queueMicrotask` is
 * in-process work, not a timer, and is never recorded.
 */

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

/** @internal */
export type TimerName = 'setTimeout' | 'setInterval' | 'setImmediate'

const TIMER_NAMES: ReadonlyArray<TimerName> = ['setTimeout', 'setInterval', 'setImmediate']

/** @internal */
export interface Escape {
  readonly timer: TimerName
  readonly site: string
}

type TimerFunction = (...args: ReadonlyArray<Field>) => Field

// Frames inside this package are the recorder's own machinery, not the call site.
// Matches both `src/` (resolved through the workspace source condition) and `dist/`.
const OWN_MODULE = /effect-sim-kernel[/\\](?:src|dist)[/\\]/u
const BUNDLED_DEPENDENCY = /.*node_modules[/\\]\.pnpm[/\\][^/\\]+[/\\]node_modules[/\\]/u

const stackFrames = (): ReadonlyArray<string> => (new Error().stack ?? '').split('\n').slice(2)

const outsideFrames = (): ReadonlyArray<string> => stackFrames().filter((frame) => !OWN_MODULE.test(frame))

const shorten = (frame: string): string => frame.trim().replace(/^at /u, '').replace(BUNDLED_DEPENDENCY, '')

const siteOf = (): string => outsideFrames().slice(0, 2).map(shorten).join(' <- ')

const isTimer = (candidate: Field): candidate is TimerFunction => typeof candidate === 'function'

const timerOf = (name: TimerName): TimerFunction | undefined => {
  const original: Field = Reflect.get(globalThis, name)
  return isTimer(original) ? original : undefined
}

type Report = (escape: Escape) => void

const wrapperOf =
  (name: TimerName, original: TimerFunction, report: Report) => (...args: ReadonlyArray<Field>): Field => {
    report({ timer: name, site: siteOf() })
    return Reflect.apply(original, globalThis, args)
  }

const captureTimer = (originals: Map<TimerName, TimerFunction>, name: TimerName): void => {
  const original = timerOf(name)
  if (original !== undefined) originals.set(name, original)
}

const capturedTimers = (): Map<TimerName, TimerFunction> => {
  const originals = new Map<TimerName, TimerFunction>()
  for (const name of TIMER_NAMES) captureTimer(originals, name)
  return originals
}

const reinstall = (originals: ReadonlyMap<TimerName, TimerFunction>): void => {
  for (const [name, original] of originals) Reflect.set(globalThis, name, original)
}

/**
 * Wrap the global timer functions so every call made while the run is live is
 * reported, then still carried out so the run can be classified. Returns the
 * restore function; a run installs the recorder at its start and restores it in
 * its `finally`, so nothing outside a run is ever observed.
 */
/** @internal */
export const installEscapeRecorder = (report: Report): () => void => {
  const originals = capturedTimers()
  for (const [name, original] of originals) {
    Reflect.set(globalThis, name, wrapperOf(name, original, report))
  }
  return () => reinstall(originals)
}

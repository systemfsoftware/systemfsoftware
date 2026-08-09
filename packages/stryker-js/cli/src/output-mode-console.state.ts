import { format as utilFormat, inspect as utilInspect } from 'node:util'
import type { InspectOptions } from 'node:util'

import * as Clock from 'effect/Clock'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

/**
 * U6 — the machine-mode `Console` layer (KTD3, R7).
 *
 * `@effect/cli` renders help and errors through an ANSI renderer and prints
 * them with the `Console` service — `printDocs = error => Console.error(toAnsiText(error))`
 * in cliApp.js — and there is no seam to intercept: the document is written
 * *before* the failure propagates. Machine mode therefore replaces the
 * `Console` service itself with a capturing layer: every write lands in an
 * in-memory buffer instead of the real stdout/stderr, and the terminating
 * bootstrap (stryker-cli.handler.ts) emits the buffer as one JSON envelope at
 * teardown. Human mode keeps the default console so the framework's prose
 * rendering is untouched.
 */

const capturedConsoleChunks: string[] = []
const countByLabel = new Map<string, number>()
const timeByLabel = new Map<string, number>()

function formatArgs(args: ReadonlyArray<unknown>): string {
  return utilFormat(...args)
}

function captureSync(args: ReadonlyArray<unknown>): void {
  capturedConsoleChunks.push(formatArgs(args))
}

function captureEffect(args: ReadonlyArray<unknown>): Effect.Effect<void> {
  return Effect.sync(() => captureSync(args))
}

function captureAssert(condition: boolean, args: ReadonlyArray<unknown>): void {
  if (!condition) {
    capturedConsoleChunks.push(`Assertion failed: ${formatArgs(args)}`)
  }
}

function captureCount(label: string | undefined): void {
  const key = label ?? 'default'
  const next = (countByLabel.get(key) ?? 0) + 1
  countByLabel.set(key, next)
  capturedConsoleChunks.push(`${key}: ${next}`)
}

function captureTimeEnd(label: string | undefined, now: number): void {
  const key = label ?? 'default'
  const started = timeByLabel.get(key)
  if (started !== undefined) {
    timeByLabel.delete(key)
    capturedConsoleChunks.push(`${key}: ${now - started}ms`)
  }
}

function captureTrace(args: ReadonlyArray<unknown>): void {
  capturedConsoleChunks.push(`Trace: ${formatArgs(args)}\n${new Error().stack ?? ''}`)
}

const capturingConsole: Console.Console = {
  [Console.TypeId]: Console.TypeId,
  assert: (condition: boolean, ...args: ReadonlyArray<unknown>) => Effect.sync(() => captureAssert(condition, args)),
  clear: Effect.void,
  count: (label) => Effect.sync(() => captureCount(label)),
  countReset: (label) => Effect.sync(() => countByLabel.delete(label ?? 'default')),
  debug: (...args: ReadonlyArray<unknown>) => captureEffect(args),
  dir: (item: unknown, options?: InspectOptions) =>
    Effect.sync(() => capturedConsoleChunks.push(utilInspect(item, options))),
  dirxml: (item) => Effect.sync(() => capturedConsoleChunks.push(utilInspect(item))),
  error: (...args: ReadonlyArray<unknown>) => captureEffect(args),
  group: () => Effect.void,
  groupEnd: Effect.void,
  info: (...args: ReadonlyArray<unknown>) => captureEffect(args),
  log: (...args: ReadonlyArray<unknown>) => captureEffect(args),
  table: (tabularData) =>
    Effect.sync(() => capturedConsoleChunks.push(utilInspect(tabularData, { colors: false, depth: null }))),
  time: (label) =>
    Effect.gen(function*() {
      timeByLabel.set(label ?? 'default', yield* Clock.currentTimeMillis)
    }),
  timeEnd: (label) =>
    Effect.gen(function*() {
      captureTimeEnd(label, yield* Clock.currentTimeMillis)
    }),
  timeLog: (label: string | undefined, ...args: ReadonlyArray<unknown>) =>
    Effect.gen(function*() {
      const key = label ?? 'default'
      const started = timeByLabel.get(key)
      if (started !== undefined) {
        capturedConsoleChunks.push(`${key}: ${(yield* Clock.currentTimeMillis) - started}ms ${formatArgs(args)}`)
      }
    }),
  trace: (...args: ReadonlyArray<unknown>) => Effect.sync(() => captureTrace(args)),
  warn: (...args: ReadonlyArray<unknown>) => captureEffect(args),
  unsafe: {
    assert: (condition: boolean, ...args: ReadonlyArray<unknown>) => captureAssert(condition, args),
    clear: () => {},
    count: (label) => captureCount(label),
    countReset: (label) => countByLabel.delete(label ?? 'default'),
    debug: (...args: ReadonlyArray<unknown>) => captureSync(args),
    dir: (item: unknown, options?: InspectOptions) => capturedConsoleChunks.push(utilInspect(item, options)),
    dirxml: (item) => capturedConsoleChunks.push(utilInspect(item)),
    error: (...args: ReadonlyArray<unknown>) => captureSync(args),
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    info: (...args: ReadonlyArray<unknown>) => captureSync(args),
    log: (...args: ReadonlyArray<unknown>) => captureSync(args),
    table: (tabularData) => capturedConsoleChunks.push(utilInspect(tabularData, { colors: false, depth: null })),
    time: (label) => timeByLabel.set(label ?? 'default', Effect.runSync(Clock.currentTimeMillis)),
    timeEnd: (label) => captureTimeEnd(label, Effect.runSync(Clock.currentTimeMillis)),
    timeLog: (label: string | undefined, ...args: ReadonlyArray<unknown>) => {
      const key = label ?? 'default'
      const started = timeByLabel.get(key)
      if (started !== undefined) {
        capturedConsoleChunks.push(`${key}: ${Effect.runSync(Clock.currentTimeMillis) - started}ms ${formatArgs(args)}`)
      }
    },
    trace: (...args: ReadonlyArray<unknown>) => captureTrace(args),
    warn: (...args: ReadonlyArray<unknown>) => captureSync(args),
  },
}

/**
 * The machine-mode `Console` layer. Constructing it clears the capture
 * buffer so every run starts empty; the terminating bootstrap reads the
 * buffer back through `readCapturedConsole` at teardown.
 *
 * The layer must reach `FiberRef.currentServices`, not just the fiber
 * context: `Console.log`/`Console.error` resolve the service from the
 * default-services FiberRef (`consoleWith`), so a plain `Layer.succeed`
 * provide is a silent no-op. `Console.setConsole` is the primitive that
 * rewrites `currentServices` for the provided scope.
 */
export function machineConsoleLayer(): Layer.Layer<Console.Console> {
  resetCapturedConsole()
  return Layer.mergeAll(
    Console.setConsole(capturingConsole),
    Layer.succeed(Console.Console, capturingConsole),
  )
}

/**
 * The identity console, mirroring effect's internal default: every method
 * delegates to the global `console`, which is exactly the prose rendering a
 * human-mode run uses. Provided for symmetry with `machineConsoleLayer` so
 * the bootstrap picks a layer by mode and the two paths cannot drift.
 */
const humanConsole: Console.Console = {
  [Console.TypeId]: Console.TypeId,
  assert: (condition: boolean, ...args: ReadonlyArray<unknown>) =>
    Effect.sync(() => console.assert(condition, ...args)),
  clear: Effect.sync(() => console.clear()),
  count: (label) => Effect.sync(() => console.count(label)),
  countReset: (label) => Effect.sync(() => console.countReset(label)),
  debug: (...args: ReadonlyArray<unknown>) => Effect.sync(() => console.debug(...args)),
  dir: (item: unknown, options?: InspectOptions) => Effect.sync(() => console.dir(item, options)),
  dirxml: (...args: ReadonlyArray<unknown>) => Effect.sync(() => console.dirxml(...args)),
  error: (...args: ReadonlyArray<unknown>) => Effect.sync(() => console.error(...args)),
  group: (options) =>
    Effect.sync(() => {
      if (options === undefined) {
        console.group()
      } else if (options.collapsed) {
        console.groupCollapsed(options.label)
      } else {
        console.group(options.label)
      }
    }),
  groupEnd: Effect.sync(() => console.groupEnd()),
  info: (...args: ReadonlyArray<unknown>) => Effect.sync(() => console.info(...args)),
  log: (...args: ReadonlyArray<unknown>) => Effect.sync(() => console.log(...args)),
  table: (tabularData: unknown, properties?: ReadonlyArray<string>) =>
    Effect.sync(() => console.table(tabularData, properties)),
  time: (label) => Effect.sync(() => console.time(label)),
  timeEnd: (label) => Effect.sync(() => console.timeEnd(label)),
  timeLog: (label: string | undefined, ...args: ReadonlyArray<unknown>) =>
    Effect.sync(() => console.timeLog(label, ...args)),
  trace: (...args: ReadonlyArray<unknown>) => Effect.sync(() => console.trace(...args)),
  warn: (...args: ReadonlyArray<unknown>) => Effect.sync(() => console.warn(...args)),
  unsafe: console,
}

/**
 * The human-mode `Console` layer: identity — the framework's prose rendering
 * reaches the real stdout/stderr unchanged. Same `setConsole` mechanism as
 * the machine layer so the two paths cannot drift.
 */
export function humanConsoleLayer(): Layer.Layer<Console.Console> {
  return Layer.mergeAll(
    Console.setConsole(humanConsole),
    Layer.succeed(Console.Console, humanConsole),
  )
}

/**
 * The text captured so far by the machine console layer, joined into one
 * document the way a terminal would have rendered it (one console call per
 * line). Empty in human mode.
 */
export function readCapturedConsole(): string {
  return capturedConsoleChunks.join('\n')
}

/**
 * Clears the capture buffer and the count/time tables. Called when the
 * machine layer is constructed so every run starts empty.
 */
export function resetCapturedConsole(): void {
  capturedConsoleChunks.length = 0
  countByLabel.clear()
  timeByLabel.clear()
}

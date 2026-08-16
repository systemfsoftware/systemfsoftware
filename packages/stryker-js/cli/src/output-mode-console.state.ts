import { performance } from 'node:perf_hooks'
import { format as utilFormat, inspect as utilInspect } from 'node:util'

import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

/**
 * U6 — the machine-mode `Console` layer (KTD3, R7).
 *
 * The v4 CLI renders help and errors through an ANSI renderer and prints them
 * with the `Console` reference — and there is no seam to intercept: the
 * document is written *before* the failure propagates. Machine mode therefore
 * replaces the `Console` reference itself with a capturing implementation:
 * every write lands in an in-memory buffer instead of the real stdout/stderr,
 * and the terminating bootstrap (stryker-cli.handler.ts) emits the buffer as
 * one JSON envelope at teardown. Human mode keeps the default console so the
 * framework's prose rendering is untouched.
 *
 * The v4 `Console.Console` interface is the sync `globalThis.console` shape
 * (the v3 service's effect-returning surface became the module-level
 * wrapper functions), so the capture implementation needs no `unsafe`
 * mirror — every method stores into the buffer directly.
 */

const capturedConsoleChunks: string[] = []
const countByLabel = new Map<string, number>()
const timeByLabel = new Map<string, number>()

function formatArgs(args: readonly unknown[]): string {
  return utilFormat(...args)
}

function captureSync(args: readonly unknown[]): void {
  capturedConsoleChunks.push(formatArgs(args))
}

function captureAssert(condition: boolean, args: readonly unknown[]): void {
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

function captureTrace(args: readonly unknown[]): void {
  capturedConsoleChunks.push(`Trace: ${formatArgs(args)}\n${new Error().stack ?? ''}`)
}

const capturingConsole: Console.Console = {
  assert: (condition: boolean, ...args: readonly unknown[]) => captureAssert(condition, args),
  clear: () => {},
  count: (label) => captureCount(label),
  countReset: (label) => countByLabel.delete(label ?? 'default'),
  debug: (...args: readonly unknown[]) => captureSync(args),
  dir: (item: unknown, options?: Record<string, unknown>) => capturedConsoleChunks.push(utilInspect(item, options)),
  dirxml: (item) => capturedConsoleChunks.push(utilInspect(item)),
  error: (...args: readonly unknown[]) => captureSync(args),
  group: () => {},
  groupCollapsed: () => {},
  groupEnd: () => {},
  info: (...args: readonly unknown[]) => captureSync(args),
  log: (...args: readonly unknown[]) => captureSync(args),
  table: (tabularData) => capturedConsoleChunks.push(utilInspect(tabularData, { colors: false, depth: null })),
  time: (label) => timeByLabel.set(label ?? 'default', performance.now()),
  timeEnd: (label) => captureTimeEnd(label, performance.now()),
  timeLog: (label, ...args) => {
    const key = label ?? 'default'
    const started = timeByLabel.get(key)
    if (started !== undefined) {
      capturedConsoleChunks.push(`${key}: ${performance.now() - started}ms ${formatArgs(args)}`)
    }
  },
  trace: (...args: readonly unknown[]) => captureTrace(args),
  warn: (...args: readonly unknown[]) => captureSync(args),
}

/**
 * The machine-mode `Console` layer. Building it clears the capture buffer so
 * every run starts empty; the terminating bootstrap reads the buffer back
 * through `readCapturedConsole` at teardown. A `Layer` is already lazy, so
 * the layer is a value: the reset effect runs when the layer is built.
 *
 * The layer must replace the `Console` reference the module-level
 * `Console.log`/`Console.error` wrappers read through their fiber context;
 * v4 reads the override the same way it reads any provided service, so a
 * plain provide is sufficient — no special `setConsole`-style primitive
 * exists any more. The reference's identifier is `never` (it carries no
 * requirement), so the layer's type is too.
 *
 * Human mode provides no Console binding at all: effect's own default
 * console delegates every method to the global console, which is exactly the
 * prose rendering a human-mode run uses. Mirroring it here would reimplement
 * the library default (V.7).
 */
export const machineConsoleLayer: Layer.Layer<never> = Layer.effect(
  Console.Console,
  Effect.sync(() => {
    resetCapturedConsole()
    return capturingConsole
  }),
)

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

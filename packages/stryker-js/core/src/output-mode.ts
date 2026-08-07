import { format as utilFormat, inspect as utilInspect } from 'node:util'

import * as HelpDoc from '@effect/cli/HelpDoc'
import * as ValidationError from '@effect/cli/ValidationError'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

/**
 * U3 — mode detection and output routing.
 *
 * One resolved mode decides every output decision for a run, and an explicit
 * flag can always override it (R4). The signal that decided is recorded so a
 * misclassified caller can diagnose without guessing — the verdict envelope
 * (U4) carries it.
 *
 * Precedence (R4): explicit `--format`/`--json` flag, then `STRYKER_MODE`,
 * then `!stdout.isTTY`, then `AGENT` non-empty, then a known tool variable,
 * then human. There is no stdin condition — R4 reverted it after it
 * misclassified `stryker run < /dev/null` in a terminal as an agent; the
 * PTY-allocating harnesses it was meant to rescue are covered by the
 * tool-variable list instead.
 */

export type OutputMode = 'human' | 'machine'

/**
 * Which input decided the resolved mode, for the envelope (U4): `flag` — an
 * explicit `--format`/`--json` override; `env` — `STRYKER_MODE`; `tty` —
 * stdout TTY state; `agent` — `AGENT` set to a non-empty value; `tool` — a
 * known tool variable set.
 */
export type ModeSignal = 'flag' | 'env' | 'tty' | 'agent' | 'tool'

/**
 * The resolved mode plus the signal that decided it. `stdoutIsTTY` rides
 * along as the detection data the decision was made from, so the progress
 * bar's gate reuses the same inputs instead of probing stdout a second time.
 */
export interface ResolvedMode {
  readonly mode: OutputMode
  readonly signal: ModeSignal
  readonly stdoutIsTTY: boolean
}

/**
 * The known tool variables. Narrow per the plan — exactly
 * `['CLAUDECODE', 'CODEX_SANDBOX']` — and load-bearing rather than a
 * fallback: they cover the PTY-allocating harnesses a stdin condition would
 * have rescued.
 */
export const TOOL_VARIABLES = ['CLAUDECODE', 'CODEX_SANDBOX'] as const

export type ToolVariable = (typeof TOOL_VARIABLES)[number]

export interface FormatFlags {
  readonly text?: boolean
  readonly json?: boolean
}

export interface ModeInput extends FormatFlags {
  readonly envMode?: string
  readonly stdoutIsTTY: boolean
  readonly agent?: string
  readonly toolVars?: Readonly<Partial<Record<ToolVariable, string | undefined>>>
}

/**
 * Resolves the output mode by R4 precedence. Pure — reads nothing, so it is
 * fully testable; the caller supplies every input once at startup.
 */
export function resolveMode(input: ModeInput): ResolvedMode {
  // The two flags contradict each other and are a caller error, never a
  // silent winner.
  if (input.text === true && input.json === true) {
    throw ValidationError.invalidValue(
      HelpDoc.p(
        'The "--format text" and "--json" flags are mutually exclusive — use one or the other',
      ),
    )
  }
  if (input.text === true) {
    return { mode: 'human', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY }
  }
  if (input.json === true) {
    return { mode: 'machine', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY }
  }
  // Set-but-empty falls through to detection, the same way an empty AGENT
  // does; only the literal 'machine' activates machine mode.
  if (input.envMode !== undefined && input.envMode.length > 0) {
    return {
      mode: input.envMode === 'machine' ? 'machine' : 'human',
      signal: 'env',
      stdoutIsTTY: input.stdoutIsTTY,
    }
  }
  // Stdout is the primary signal — it is what the output is written to.
  if (!input.stdoutIsTTY) {
    return { mode: 'machine', signal: 'tty', stdoutIsTTY: false }
  }
  // AGENT is additive: any non-empty value means machine mode.
  if (input.agent !== undefined && input.agent.length > 0) {
    return { mode: 'machine', signal: 'agent', stdoutIsTTY: true }
  }
  for (const variable of TOOL_VARIABLES) {
    const value = input.toolVars?.[variable]
    if (value !== undefined && value.length > 0) {
      return { mode: 'machine', signal: 'tool', stdoutIsTTY: true }
    }
  }
  return { mode: 'human', signal: 'tty', stdoutIsTTY: true }
}

/**
 * The one impure adapter over `resolveMode`: reads the process environment so
 * callers with no CLI-parsed flags — the library entry point, the reporters —
 * cannot drift into private copies of the probe and disagree about the mode.
 */
export function detectMode(): ResolvedMode {
  return resolveMode({
    stdoutIsTTY: process.stdout.isTTY === true,
    envMode: process.env['STRYKER_MODE'],
    agent: process.env['AGENT'],
    toolVars: {
      CLAUDECODE: process.env['CLAUDECODE'],
      CODEX_SANDBOX: process.env['CODEX_SANDBOX'],
    },
  })
}

/**
 * The progress bar's gate. Human mode on a non-TTY stdout (AE1) must not leak
 * its control sequences into a pipe, and machine mode keeps stdout clean for
 * the verdict envelope (R5). Decided from the resolved mode's own detection
 * data — never a second `isTTY` probe.
 */
export function isProgressEnabled(resolved: ResolvedMode): boolean {
  return resolved.mode === 'human' && resolved.stdoutIsTTY
}

/**
 * The log colouriser's gate (R8). Machine mode never emits colour, so a
 * harness merging `2>&1` is not handed escape sequences it must strip, and
 * `NO_COLOR` is honoured for the human path per the convention: any value
 * other than an unset or empty variable disables colour.
 */
export function isColorEnabled(resolved: ResolvedMode, noColor: string | undefined): boolean {
  return resolved.mode === 'human' && (noColor === undefined || noColor.length === 0)
}

// =============================================================================
// U6 — the Console layer (R7, KTD3)
//
// `@effect/cli` renders help and errors through an ANSI renderer and prints
// them with the `Console` service — `printDocs = error => Console.error(toAnsiText(error))`
// in cliApp.js — and there is no seam to intercept: the document is written
// *before* the failure propagates. Machine mode therefore replaces the
// `Console` service itself with a capturing layer: every write lands in an
// in-memory buffer instead of the real stdout/stderr, and the terminating
// bootstrap (stryker-cli.ts) emits the buffer as one JSON envelope at
// teardown. Human mode keeps the default console so the framework's prose
// rendering is untouched.
// =============================================================================

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

function captureTimeEnd(label: string | undefined): void {
  const key = label ?? 'default'
  const started = timeByLabel.get(key)
  if (started !== undefined) {
    timeByLabel.delete(key)
    capturedConsoleChunks.push(`${key}: ${Date.now() - started}ms`)
  }
}

function captureTrace(args: ReadonlyArray<unknown>): void {
  capturedConsoleChunks.push(`Trace: ${formatArgs(args)}\n${new Error().stack ?? ''}`)
}

/**
 * The machine-mode `Console` service: every write is captured instead of
 * reaching the real stdout/stderr. The framework only ever calls `error`
 * (help/error documents) and `log` (help/version documents) with a single
 * pre-rendered string, so the count/time/table methods are defensive
 * completeness — the point is that no write method falls through.
 */
const capturingConsole: Console.Console = {
  [Console.TypeId]: Console.TypeId,
  assert: (condition, ...args) => Effect.sync(() => captureAssert(condition, args)),
  clear: Effect.void,
  count: (label) => Effect.sync(() => captureCount(label)),
  countReset: (label) => Effect.sync(() => countByLabel.delete(label ?? 'default')),
  debug: (...args) => captureEffect(args),
  dir: (item, options) => Effect.sync(() => capturedConsoleChunks.push(utilInspect(item, options))),
  dirxml: (item) => Effect.sync(() => capturedConsoleChunks.push(utilInspect(item))),
  error: (...args) => captureEffect(args),
  group: () => Effect.void,
  groupEnd: Effect.void,
  info: (...args) => captureEffect(args),
  log: (...args) => captureEffect(args),
  table: (tabularData) =>
    Effect.sync(() => capturedConsoleChunks.push(utilInspect(tabularData, { colors: false, depth: null }))),
  time: (label) => Effect.sync(() => timeByLabel.set(label ?? 'default', Date.now())),
  timeEnd: (label) => Effect.sync(() => captureTimeEnd(label)),
  timeLog: (label, ...args) =>
    Effect.sync(() => {
      const key = label ?? 'default'
      const started = timeByLabel.get(key)
      if (started !== undefined) {
        capturedConsoleChunks.push(`${key}: ${Date.now() - started}ms ${formatArgs(args)}`)
      }
    }),
  trace: (...args) => Effect.sync(() => captureTrace(args)),
  warn: (...args) => captureEffect(args),
  unsafe: {
    assert: (condition, ...args) => captureAssert(condition, args),
    clear: () => {},
    count: (label) => captureCount(label),
    countReset: (label) => countByLabel.delete(label ?? 'default'),
    debug: (...args) => captureSync(args),
    dir: (item, options) => capturedConsoleChunks.push(utilInspect(item, options)),
    dirxml: (item) => capturedConsoleChunks.push(utilInspect(item)),
    error: (...args) => captureSync(args),
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    info: (...args) => captureSync(args),
    log: (...args) => captureSync(args),
    table: (tabularData) => capturedConsoleChunks.push(utilInspect(tabularData, { colors: false, depth: null })),
    time: (label) => timeByLabel.set(label ?? 'default', Date.now()),
    timeEnd: (label) => captureTimeEnd(label),
    timeLog: (label, ...args) => {
      const key = label ?? 'default'
      const started = timeByLabel.get(key)
      if (started !== undefined) {
        capturedConsoleChunks.push(`${key}: ${Date.now() - started}ms ${formatArgs(args)}`)
      }
    },
    trace: (...args) => captureTrace(args),
    warn: (...args) => captureSync(args),
  },
}

/**
 * The machine-mode `Console` layer (KTD3). Constructing it clears the capture
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
  assert: (condition, ...args) => Effect.sync(() => console.assert(condition, ...args)),
  clear: Effect.sync(() => console.clear()),
  count: (label) => Effect.sync(() => console.count(label)),
  countReset: (label) => Effect.sync(() => console.countReset(label)),
  debug: (...args) => Effect.sync(() => console.debug(...args)),
  dir: (item, options) => Effect.sync(() => console.dir(item, options)),
  dirxml: (...args) => Effect.sync(() => console.dirxml(...args)),
  error: (...args) => Effect.sync(() => console.error(...args)),
  group: (options) =>
    Effect.sync(() => {
      if (options?.collapsed) {
        console.groupCollapsed(options.label)
      } else {
        console.group(options.label)
      }
    }),
  groupEnd: Effect.sync(() => console.groupEnd()),
  info: (...args) => Effect.sync(() => console.info(...args)),
  log: (...args) => Effect.sync(() => console.log(...args)),
  table: (tabularData, properties) => Effect.sync(() => console.table(tabularData, properties)),
  time: (label) => Effect.sync(() => console.time(label)),
  timeEnd: (label) => Effect.sync(() => console.timeEnd(label)),
  timeLog: (label, ...args) => Effect.sync(() => console.timeLog(label, ...args)),
  trace: (...args) => Effect.sync(() => console.trace(...args)),
  warn: (...args) => Effect.sync(() => console.warn(...args)),
  unsafe: console as Console.UnsafeConsole,
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
 * machine layer is constructed so every run starts empty; exported for the
 * error-envelope tests.
 */
export function resetCapturedConsole(): void {
  capturedConsoleChunks.length = 0
  countByLabel.clear()
  timeByLabel.clear()
}

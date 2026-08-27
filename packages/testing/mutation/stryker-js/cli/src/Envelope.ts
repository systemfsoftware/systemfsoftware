/**
 * Envelope — the failure envelope and console capture leaf.
 *
 * Extracted from Cli.ts to break the import cycle Cli <-> Output.
 * Both Cli and Output import from this leaf, so neither depends on the other
 * for these values. This file imports only from external packages and from
 * StreamVersion (leaf) and Survivors.workflow (leaf), never from Cli or Output
 * themselves.
 */
import { ExitClass, highestExitClass } from '@systemfsoftware/stryker-js/ExitClass'
import { causeText } from '@systemfsoftware/stryker-js/Mutant'
import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Formatter from 'effect/Formatter'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import * as CliError from 'effect/unstable/cli/CliError'
import {
  type RunOk,
  runOutcomeCode,
  RunOutcomeCommand,
  runOutcomeDecision,
  type RunOutcomeError,
} from './RunOutcome.workflow.js'
import { STREAM_SCHEMA_VERSION } from './StreamVersion.js'
import { SurvivorsRejection } from './Survivors.workflow.js'

export function isExitClass(value: unknown): value is ExitClass {
  return S.is(ExitClass)(value)
}

export function exitClassOf(value: unknown): ExitClass | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  if (!('exitClass' in value)) {
    return undefined
  }
  const raw: unknown = Reflect.get(value, 'exitClass')
  if (!isExitClass(raw)) {
    return undefined
  }
  return raw
}

function collectExitClassesFromValue(
  value: unknown,
  out: Array<ExitClass>,
  seen: WeakSet<object>,
  depth: number,
): void {
  if (depth > 10 || value === null || value === undefined) {
    return
  }
  if (typeof value !== 'object') {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)
  const ec = exitClassOf(value)
  if (ec !== undefined) {
    out.push(ec)
  }
  if ('cause' in value) {
    const causeVal: unknown = Reflect.get(value, 'cause')
    if (Array.isArray(causeVal)) {
      for (const entry of causeVal) {
        collectExitClassesFromValue(entry, out, seen, depth + 1)
      }
    } else {
      collectExitClassesFromValue(causeVal, out, seen, depth + 1)
    }
  }
}

export function collectExitClasses(exit: Exit.Exit<unknown, unknown>): Array<ExitClass> {
  const out: Array<ExitClass> = []
  const seen = new WeakSet<object>()
  if (Exit.isFailure(exit)) {
    for (const reason of exit.cause.reasons) {
      let candidate: unknown
      if (Cause.isFailReason(reason)) {
        candidate = reason.error
      } else if (Cause.isDieReason(reason)) {
        candidate = reason.defect
      } else {
        candidate = undefined
      }
      if (candidate !== undefined) {
        collectExitClassesFromValue(candidate, out, seen, 0)
      }
    }
  }
  return out
}

function reasonOf(value: object): string | undefined {
  if (!('reason' in value)) {
    return undefined
  }
  const reason: unknown = Reflect.get(value, 'reason')
  if (typeof reason !== 'string' || reason.length === 0) {
    return undefined
  }
  const detail = causeTextOf(value)
  if (detail === undefined) {
    return reason
  }
  return `${reason}: ${detail}`
}

function causeTextOf(value: object, depth = 0): string | undefined {
  if (depth > 4 || !('cause' in value)) {
    return undefined
  }
  const cause: unknown = Reflect.get(value, 'cause')
  return causeText(cause, depth + 1)
}

function configDetailOf(value: object): string | undefined {
  if (!('reason' in value) && !('message' in value)) {
    return undefined
  }
  const reason: unknown = Reflect.get(value, 'reason')
  if (typeof reason === 'string' && reason.length > 0) {
    return reason
  }
  const message: unknown = Reflect.get(value, 'message')
  if (typeof message === 'string' && message.length > 0) {
    return message
  }
  return undefined
}

function shouldVisitConfigValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): value is object {
  if (depth > 10) {
    return false
  }
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value !== 'object') {
    return false
  }
  if (seen.has(value)) {
    return false
  }
  return true
}

function pushConfigCauses(
  value: object,
  depth: number,
  stack: Array<{ value: unknown; depth: number }>,
): void {
  if (!('cause' in value)) {
    return
  }
  const causeVal: unknown = Reflect.get(value, 'cause')
  if (Array.isArray(causeVal)) {
    for (let index = causeVal.length - 1; index >= 0; index--) {
      stack.push({ value: causeVal[index], depth: depth + 1 })
    }
  } else {
    stack.push({ value: causeVal, depth: depth + 1 })
  }
}

function firstConfigErrorDetail(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const seen = new WeakSet<object>()
  const stack: Array<{ value: unknown; depth: number }> = []
  for (const reason of exit.cause.reasons) {
    let candidate: unknown
    if (Cause.isFailReason(reason)) {
      candidate = reason.error
    } else if (Cause.isDieReason(reason)) {
      candidate = reason.defect
    } else {
      candidate = undefined
    }
    if (candidate !== undefined) {
      stack.push({ value: candidate, depth: 0 })
    }
  }
  while (stack.length > 0) {
    const entry = stack.pop()
    if (entry === undefined) {
      continue
    }
    const { value, depth } = entry
    if (!shouldVisitConfigValue(value, depth, seen)) {
      continue
    }
    seen.add(value)
    if (exitClassOf(value) === 'ConfigError') {
      const detail = configDetailOf(value)
      if (detail !== undefined) {
        return detail
      }
    }
    pushConfigCauses(value, depth, stack)
  }
  return undefined
}

export function remediationFor(exit: Exit.Exit<unknown, unknown>, code: number): string {
  return buildErrorEnvelope(exit, code, '', []).remediation
}

export function describeFailure(exit: Exit.Exit<unknown, unknown>): string {
  if (!Exit.isFailure(exit)) {
    return 'Unknown failure'
  }
  const value = failureValue(exit)
  if (value !== undefined) {
    if (S.is(SurvivorsRejection)(value)) {
      return value.remediation
    }
    if (typeof value === 'object' && value !== null) {
      const reason = reasonOf(value)
      if (reason !== undefined) {
        return reason
      }
    }
    if (value instanceof Error && value.message.length > 0) {
      return value.message
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint' ||
      typeof value === 'symbol'
    ) {
      return String(value)
    }
  }
  const classes = collectExitClasses(exit)
  if (classes.includes('ConfigError')) {
    const detail = firstConfigErrorDetail(exit)
    if (detail !== undefined) {
      return detail
    }
  }
  const rendered = Cause.pretty(exit.cause)
  if (rendered.length > 0) {
    return rendered
  }
  return 'Unknown failure'
}

export function unrecognizedArgumentOf(
  exit: Exit.Exit<unknown, unknown>,
  argv: readonly string[],
): string | undefined {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const value = failureValue(exit)
  if (value === undefined || !CliError.isCliError(value)) {
    return undefined
  }
  const errors = (() => {
    if (S.is(CliError.ShowHelp)(value)) {
      return value.errors
    }
    return [value]
  })()
  for (const error of errors) {
    if (S.is(CliError.UnrecognizedOption)(error)) {
      const at = argv.indexOf(error.option)
      const next = (() => {
        if (at >= 0) {
          return argv[at + 1]
        }
        return undefined
      })()
      if (next !== undefined && !next.startsWith('-')) {
        return next
      }
      return error.option
    }
    if (S.is(CliError.UnexpectedArgument)(error)) {
      return error.arguments[0]
    }
    if (S.is(CliError.UnknownSubcommand)(error)) {
      return error.subcommand
    }
  }
  return undefined
}

export function failureValue(exit: Exit.Exit<unknown, unknown>): unknown {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isSome(failure)) {
    return failure.value
  }
  return undefined
}

export interface ErrorEnvelope {
  readonly schemaVersion: string
  readonly code: number
  readonly error: string
  readonly remediation: string
}

const SIGNAL_REMEDIATION = 'the run was interrupted by a signal; re-run it to continue'
const PARSE_REMEDIATION = 're-run with --help to see the full usage'
const DEFAULT_REMEDIATION = 'see --reportFile or the verdict envelope on stdout'

function successExitClassOf(exit: Exit.Exit<unknown, unknown>): ExitClass | undefined {
  if (!Exit.isSuccess(exit)) {
    return undefined
  }
  const value = exit.value
  if (!Predicate.hasProperty(value, 'verdict')) {
    return undefined
  }
  const candidate = value.verdict
  if (!isExitClass(candidate)) {
    return undefined
  }
  return candidate
}

function helpErrorCountOf(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!S.is(CliError.ShowHelp)(value)) {
    return undefined
  }
  return value.errors.length
}

function survivorsRejectionOf(value: unknown): SurvivorsRejection | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!S.is(SurvivorsRejection)(value)) {
    return undefined
  }
  return value
}

function present<A>(value: A | null): A | undefined {
  if (value === null) {
    return undefined
  }
  return value
}

function survivorsReasonOf(
  survivors: SurvivorsRejection | undefined,
): 'no-report' | 'mismatch' | undefined {
  if (survivors === undefined) {
    return undefined
  }
  return survivors.reason
}

function survivorsDiagnosticOf(survivors: SurvivorsRejection | undefined): string | undefined {
  if (survivors === undefined) {
    return undefined
  }
  return survivors.remediation
}

function omitUnknownFailure(diagnostic: string): string | undefined {
  if (diagnostic === 'Unknown failure') {
    return undefined
  }
  return diagnostic
}

function signalFromCode(code: number): number | null {
  if (code > 128) {
    return code - 128
  }
  return null
}

function capturedOrUnknown(captured: string): string {
  if (captured.length > 0) {
    return captured
  }
  return 'Unknown failure'
}

export function gatherRunOutcome(
  exit: Exit.Exit<unknown, unknown>,
  signal: number | null,
  argv: readonly string[],
): RunOutcomeCommand {
  const value = failureValue(exit)
  const survivors = survivorsRejectionOf(value)
  return RunOutcomeCommand.make({
    succeeded: Exit.isSuccess(exit),
    signal: present(signal),
    interrupted: Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
    helpErrorCount: helpErrorCountOf(value),
    cliError: value !== undefined && CliError.isCliError(value),
    unrecognized: unrecognizedArgumentOf(exit, argv),
    survivorsReason: survivorsReasonOf(survivors),
    survivorsDiagnostic: survivorsDiagnosticOf(survivors),
    schemaError: value !== undefined && S.isSchemaError(value),
    successExitClass: successExitClassOf(exit),
    highestExitClass: present(highestExitClass(collectExitClasses(exit))),
    configDetail: firstConfigErrorDetail(exit),
    diagnostic: omitUnknownFailure(describeFailure(exit)),
  })
}

function errorText(error: RunOutcomeError, captured: string): string {
  return Match.value(error).pipe(
    Match.tag('RunParseFailed', (failed) => {
      if (failed.unrecognized !== undefined) {
        return `Received unknown argument: '${failed.unrecognized}'`
      }
      return capturedOrUnknown(captured)
    }),
    Match.tag('RunSurvivorsRejected', (failed) => {
      if (failed.diagnostic !== undefined) {
        return failed.diagnostic
      }
      return 'Unknown failure'
    }),
    Match.tag('RunInterrupted', () => capturedOrUnknown(captured)),
    Match.tag('RunConfigFailed', (failed) => {
      if (captured.length > 0) {
        return captured
      }
      if (failed.detail !== undefined) {
        return failed.detail
      }
      return 'Unknown failure'
    }),
    Match.tag('RunFailed', (failed) => {
      if (captured.length > 0) {
        return captured
      }
      if (failed.diagnostic !== undefined) {
        return failed.diagnostic
      }
      return 'Unknown failure'
    }),
    Match.exhaustive,
  )
}

function remediationText(error: RunOutcomeError): string {
  return Match.value(error).pipe(
    Match.tag('RunInterrupted', (failed) => {
      if (failed.code > 128) {
        return SIGNAL_REMEDIATION
      }
      return DEFAULT_REMEDIATION
    }),
    Match.tag('RunParseFailed', () => PARSE_REMEDIATION),
    Match.tag('RunSurvivorsRejected', (failed) => {
      if (failed.diagnostic !== undefined) {
        return failed.diagnostic
      }
      return DEFAULT_REMEDIATION
    }),
    Match.tag('RunConfigFailed', (failed) => {
      if (failed.detail !== undefined) {
        return `check the config file: ${failed.detail}`
      }
      return 'check the config file'
    }),
    Match.tag('RunFailed', () => DEFAULT_REMEDIATION),
    Match.exhaustive,
  )
}

export function shapeEnvelope(error: RunOutcomeError, captured: string): ErrorEnvelope {
  return {
    schemaVersion: STREAM_SCHEMA_VERSION,
    code: runOutcomeCode(Result.fail(error)),
    error: errorText(error, captured),
    remediation: remediationText(error),
  }
}

export function classifyRunOutcome(
  exit: Exit.Exit<unknown, unknown>,
  signal: number | null,
  argv: readonly string[],
): Result.Result<RunOk, RunOutcomeError> {
  return runOutcomeDecision(gatherRunOutcome(exit, signal, argv))
}

export function buildErrorEnvelope(
  exit: Exit.Exit<unknown, unknown>,
  code: number,
  captured: string,
  argv: readonly string[],
): ErrorEnvelope {
  const result = classifyRunOutcome(exit, signalFromCode(code), argv)
  if (Result.isSuccess(result)) {
    return {
      schemaVersion: STREAM_SCHEMA_VERSION,
      code,
      error: capturedOrUnknown(captured),
      remediation: DEFAULT_REMEDIATION,
    }
  }
  return shapeEnvelope(result.failure, captured)
}

// Console capture (U6)
const capturedConsoleChunks: string[] = []
const countByLabel = new Map<string, number>()
const timeByLabel = new Map<string, bigint>()

function inspectValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return Formatter.format(value)
}

function formatArgs(args: readonly unknown[]): string {
  if (args.length === 0) {
    return ''
  }
  const first = args[0]
  if (typeof first === 'string') {
    let index = 1
    let result = first.replace(/%[sdijfopO%]/g, (match) => {
      if (match === '%%') {
        return '%'
      }
      if (index >= args.length) {
        return match
      }
      const arg = args[index++]
      switch (match) {
        case '%s':
          return String(arg)
        case '%d':
        case '%i':
        case '%f':
          return Number(arg).toString()
        case '%j':
          try {
            return String(JSON.stringify(arg))
          } catch {
            return '[Circular]'
          }
        case '%o':
        case '%O':
        case '%p':
          return inspectValue(arg)
        default:
          return match
      }
    })
    for (; index < args.length; index++) {
      result += ` ${inspectValue(args[index])}`
    }
    return result
  }
  return args.map(inspectValue).join(' ')
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

function captureTimeEnd(label: string | undefined, nowNanos: bigint): void {
  const key = label ?? 'default'
  const started = timeByLabel.get(key)
  if (started !== undefined) {
    timeByLabel.delete(key)
    const diffMs = Number(nowNanos - started) / 1_000_000
    capturedConsoleChunks.push(`${key}: ${diffMs}ms`)
  }
}

function captureTrace(args: readonly unknown[]): void {
  capturedConsoleChunks.push(`Trace: ${formatArgs(args)}\n${new Error().stack ?? ''}`)
}

const makeCapturingConsole = (clock: Clock.Clock): Console.Console => ({
  assert: (condition: boolean, ...args: readonly unknown[]) => captureAssert(condition, args),
  clear: () => {},
  count: (label) => captureCount(label),
  countReset: (label) => countByLabel.delete(label ?? 'default'),
  debug: (...args: readonly unknown[]) => captureSync(args),
  dir: (item: unknown, _options?: Record<string, unknown>) => capturedConsoleChunks.push(Formatter.format(item)),
  dirxml: (item) => capturedConsoleChunks.push(Formatter.format(item)),
  error: (...args: readonly unknown[]) => captureSync(args),
  group: () => {},
  groupCollapsed: () => {},
  groupEnd: () => {},
  info: (...args: readonly unknown[]) => captureSync(args),
  log: (...args: readonly unknown[]) => captureSync(args),
  table: (tabularData) => capturedConsoleChunks.push(Formatter.format(tabularData)),
  time: (label) => timeByLabel.set(label ?? 'default', clock.monotonicTimeNanosUnsafe()),
  timeEnd: (label) => captureTimeEnd(label, clock.monotonicTimeNanosUnsafe()),
  timeLog: (label, ...args) => {
    const key = label ?? 'default'
    const started = timeByLabel.get(key)
    if (started === undefined) {
      return
    }
    const diffMs = Number(clock.monotonicTimeNanosUnsafe() - started) / 1_000_000
    if (args.length === 0) {
      capturedConsoleChunks.push(`${key}: ${diffMs}ms`)
      return
    }
    capturedConsoleChunks.push(`${key}: ${diffMs}ms ${formatArgs(args)}`)
  },
  trace: (...args: readonly unknown[]) => captureTrace(args),
  warn: (...args: readonly unknown[]) => captureSync(args),
})

export const machineConsoleLayer: Layer.Layer<never> = Layer.effect(
  Console.Console,
  Clock.clockWith((clock) =>
    Effect.sync(() => {
      resetCapturedConsole()
      return makeCapturingConsole(clock)
    })
  ),
)

export function readCapturedConsole(): string {
  return capturedConsoleChunks.join('\n')
}

export function resetCapturedConsole(): void {
  capturedConsoleChunks.length = 0
  countByLabel.clear()
  timeByLabel.clear()
}

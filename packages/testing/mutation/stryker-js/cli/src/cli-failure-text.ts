import { causeText } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as CliError from 'effect/unstable/cli/CliError'

import { ExitClass } from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import { collectExitClasses, exitClassOf } from './cli-exit-code.js'
import { SurvivorsRejection } from './survivors-admission.workflow.js'

/**
 * The reason a domain error carries, when it carries one.
 *
 * Every stage error in this engine is an `S.TaggedError` whose payload field is
 * `reason` — `DryRunNoTestsError`, `DryRunFailedError`, `PrepareFailedError`
 * and friends. Those classes extend `Error`, but nothing assigns `.message`, so
 * reading `.message` off one yields the empty string and the operator is told
 * a run failed with no indication of why. Read the field the errors actually
 * populate, and fall back only when it is absent.
 */
function reasonOf(value: object): string | undefined {
  if (!('reason' in value)) {
    return undefined
  }
  const reason: unknown = Reflect.get(value, 'reason')
  if (typeof reason !== 'string' || reason.length === 0) {
    return undefined
  }
  // Several of these errors wrap the failure that actually happened — a
  // spawn error, a module that would not load. `reason` alone names the stage
  // and not the fault, so "Dry run failed to start test runner" with the cause
  // withheld tells an operator no more than the empty string did.
  const detail = causeTextOf(value)
  return detail === undefined ? reason : `${reason}: ${detail}`
}

/**
 * The human-readable text of a domain error's wrapped `cause`, if it has one.
 *
 * Recurses, because these errors nest: a stage error wraps a
 * `TestRunnerFailed`, which wraps the spawn or import failure that actually
 * happened. Stopping at the first layer reports a tag name — "TestRunnerFailed"
 * — and leaves the operator to guess. Each layer contributes only what it
 * knows, so the reader gets the chain down to the real fault.
 */
function causeTextOf(value: object, depth = 0): string | undefined {
  if (depth > 4 || !('cause' in value)) {
    return undefined
  }
  const cause: unknown = Reflect.get(value, 'cause')
  return causeText(cause, depth + 1)
}

function configDetailOf(value: object): string | undefined {
  const reason = reasonOf(value)
  if (reason !== undefined) {
    return reason
  }
  const text = causeText(value, 0)
  if (text !== undefined && text.length > 0) {
    return text
  }
  if ('message' in value) {
    const msg: unknown = Reflect.get(value, 'message')
    if (typeof msg === 'string' && msg.length > 0) {
      return msg
    }
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

/**
 * The first config-class error's detail in cause-chain order, for the
 * config remediation.
 */
function firstConfigErrorDetail(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const seen = new WeakSet<object>()
  const stack: Array<{ value: unknown; depth: number }> = []
  for (const reason of exit.cause.reasons) {
    const candidate: unknown = Cause.isFailReason(reason)
      ? reason.error
      : Cause.isDieReason(reason)
      ? reason.defect
      : undefined
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
    if (exitClassOf(value) === ExitClass.ConfigError) {
      const detail = configDetailOf(value)
      if (detail !== undefined) {
        return detail
      }
    }
    pushConfigCauses(value, depth, stack)
  }
  return undefined
}

/**
 * The contextual remediation for a failure, picked from the class of the
 * failure whose cause chain contains an `exitClass` of `ConfigError` (2)
 * names the config file, rejected survivors runs name the full run to do
 * first. Everything else points at the report file and the verdict envelope,
 * which is where a runtime failure's detail already is. The classification
 * walks the `Cause` reasons and each error's nested `cause` field — see
 * `collectExitClasses`.
 */
export function remediationFor(exit: Exit.Exit<unknown, unknown>, code: number): string {
  if (code > 128) {
    return 'the run was interrupted by a signal; re-run it to continue'
  }
  const value = failureValue(exit)
  if (value !== undefined) {
    if (CliError.isCliError(value)) {
      return 're-run with --help to see the full usage'
    }
    if (S.is(SurvivorsRejection)(value)) {
      return value.remediation
    }
  }
  const classes = collectExitClasses(exit)
  if (classes.includes(ExitClass.ConfigError)) {
    const detail = firstConfigErrorDetail(exit)
    return detail !== undefined ? `check the config file: ${detail}` : 'check the config file'
  }
  return 'see --reportFile or the verdict envelope on stdout'
}

/**
 * The failure's own text, used when the capture buffer is empty — a failure
 * stryker reported through its own logger rather than the framework's
 * `Console`. Falls back to a rendered cause.
 */
export function describeFailure(exit: Exit.Exit<unknown, unknown>): string {
  if (Exit.isFailure(exit)) {
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
      return Cause.pretty(exit.cause)
    }
    return Cause.pretty(exit.cause)
  }
  return ''
}

/**
 * The argument the framework reports it does not know, named the way the wire
 * contract spells it. The v4 parser fails wrapped in a ShowHelp whose errors
 * carry the offending flag or operand; when the unrecognized flag was given a
 * separate value (`--format text`), the value is the token the old parser
 * reported, so the token after the flag is named when one was given.
 */
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
  const errors = S.is(CliError.ShowHelp)(value) ? value.errors : [value]
  for (const error of errors) {
    if (S.is(CliError.UnrecognizedOption)(error)) {
      const at = argv.indexOf(error.option)
      const next = at >= 0 ? argv[at + 1] : undefined
      return next !== undefined && !next.startsWith('-') ? next : error.option
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

/**
 * The first typed error in the exit's cause. The framework fails with
 * `Cause.fail` (usage errors); the run handler is `Effect.promise`, whose
 * rejected promises surface as *defects* (`Die` reasons) rather than
 * failures — so stryker's own ConfigError/StrykerError values arrive there
 * and must be read from the cause's `Die` reasons.
 */
export function failureValue(exit: Exit.Exit<unknown, unknown>): unknown {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isSome(failure)) {
    return failure.value
  }
  const dieReason = exit.cause.reasons.find(Cause.isDieReason)
  return dieReason === undefined ? undefined : dieReason.defect
}

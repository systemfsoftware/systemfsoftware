import { ExitClass, highestExitClass } from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as CliError from 'effect/unstable/cli/CliError'

import { SurvivorsRejection } from './survivors-admission.workflow.js'
import { SURVIVORS_REJECT_EXIT_CLASS } from './survivors-exit.js'

export function isExitClass(value: number): value is ExitClass {
  return (
    value === ExitClass.VerdictFail ||
    value === ExitClass.ConfigError ||
    value === ExitClass.RuntimeError ||
    value === ExitClass.InternalError
  )
}

/**
 * The `exitClass` of a tagged error, when it carries one.
 *
 * Every `*.schema.ts` error in `mutation-run` carries a `readonly exitClass`
 * member (or schema field) — `2` for config, `3` for runtime, `4` for
 * internal. The field is deliberately off-wire, but at the CLI edge the
 * errors are in-process objects, so it is readable via `Reflect.get`.
 */
export function exitClassOf(value: unknown): ExitClass | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  if (!('exitClass' in value)) {
    return undefined
  }
  const raw: unknown = Reflect.get(value, 'exitClass')
  if (typeof raw !== 'number' || !isExitClass(raw)) {
    return undefined
  }
  return raw
}

/**
 * Collects every `exitClass` present in a value's nested `cause` chain.
 *
 * Depth-capped and cycle-safe: schema errors nest (`PrepareFailedError`
 * wrapping `ConfigFileInvalidError` wrapping a validation detail), and a
 * malformed chain must not recurse unboundedly.
 */
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

/**
 * Collects every `exitClass` present in the failure's `Cause` and in each
 * error's nested `cause` field.
 *
 * A `Cause` holds typed `Fail` and defect `Die` reasons
 * (`repos/effect/packages/effect/src/Cause.ts:144-196`, `isFailReason` /
 * `isDieReason`). `Effect.mapError` replaces the error value while keeping
 * only the mapped error in `cause.reasons`
 * (`repos/effect/packages/effect/src/internal/effect.ts:3253-3267`), so a
 * wrapped config error is invisible at the top level and must be found by
 * walking both the `Cause` reasons and each error's own `cause` field.
 */
export function collectExitClasses(exit: Exit.Exit<unknown, unknown>): Array<ExitClass> {
  const out: Array<ExitClass> = []
  const seen = new WeakSet<object>()
  if (Exit.isFailure(exit)) {
    for (const reason of exit.cause.reasons) {
      const candidate: unknown = Cause.isFailReason(reason)
        ? reason.error
        : Cause.isDieReason(reason)
        ? reason.defect
        : undefined
      if (candidate !== undefined) {
        collectExitClassesFromValue(candidate, out, seen, 0)
      }
    }
  }
  return out
}

/**
 * Classifies a failed run for the finalizer: usage/parse failures
 * (`CliError` — except a bare help request, which exits 0), rejected
 * survivors runs (`SurvivorsRejection`), an unreadable prior report
 * (`S.SchemaError`) all exit 2; otherwise the highest `exitClass` found by
 * walking the failure's `Cause` reasons and each error's nested `cause` field
 * wins by the precedence `4 > 3 > 2 > 1` (via `highestExitClass`); no class
 * found is 1 (the framework's default). A successful run exits 0; the verdict
 * gates (U5) then resolve the final classed code.
 *
 * The report parse failure shares the survivors class deliberately. It is not a
 * verdict — the decider never sees the report — but the operator's answer is the
 * same class of answer as a rejection: the input you named cannot be used. Letting
 * it fall through to 1 would make an unusable `--survivors` input indistinguishable
 * from a crash.
 *
 * Previously this matched only a top-level `ConfigError` via `carriesConfigError`,
 * so a `PrepareFailedError` wrapping a `ConfigFileInvalidError` was invisible
 * and classes 3 and 4 were unreachable. Walking the chain makes them reachable.
 */
export function resolveCliExitCode(exit: Exit.Exit<unknown, unknown>): number {
  if (Exit.isSuccess(exit)) {
    return 0
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    return 1
  }
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isSome(failure)) {
    const value = failure.value
    if (S.is(CliError.ShowHelp)(value)) {
      // An explicit help request (bare `stryker`, `--help`) rendered the
      // usage document into the capture buffer and exits 0; a parse failure
      // the runner wrapped into ShowHelp exits 2.
      return value.errors.length > 0 ? 2 : 0
    }
    if (CliError.isCliError(value)) {
      return 2
    }
    if (S.is(SurvivorsRejection)(value)) {
      return SURVIVORS_REJECT_EXIT_CLASS
    }
    if (S.isSchemaError(value)) {
      return SURVIVORS_REJECT_EXIT_CLASS
    }
  }
  const classes = collectExitClasses(exit)
  const highest = highestExitClass(classes)
  if (highest !== null) {
    return highest
  }
  return 1
}

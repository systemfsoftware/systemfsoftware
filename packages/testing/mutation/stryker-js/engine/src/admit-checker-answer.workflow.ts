/**
 * Checker — pure decisions for the Checker capability.
 *
 * Two joins a checker can get wrong: pairing check results back to the plans
 * they were asked about, and resolving id groups back to plans. Both fail the
 * same two ways — unrequested ids and missing ids — and each carries its own
 * tag so a caller matches on the failure rather than parsing ids out of a message.
 */

import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

/**
 * A checker answered about a mutant nobody asked it about.
 *
 * Separate from the missing-result case because they mean opposite things: this
 * one says the checker invented work, the other says it dropped work. Reporting
 * both as one failure loses the only fact that tells you which plugin bug you
 * are looking at.
 */
export class CheckerAnsweredUnrequested extends S.TaggedError<CheckerAnsweredUnrequested>()(
  'CheckerAnsweredUnrequested',
  {
    checkerName: S.String,
    phase: S.Literals(['check', 'group']),
    unrequestedIds: S.Array(S.String),
    requestedIds: S.Array(S.String),
  },
) {}

/**
 * A checker did not answer about mutants it was asked about.
 *
 * Silently dropping these would mark them as needing no test, so an unchecked
 * mutant would be reported as covered.
 */
export class CheckerSkippedRequested extends S.TaggedError<CheckerSkippedRequested>()(
  'CheckerSkippedRequested',
  {
    checkerName: S.String,
    phase: S.Literals(['check', 'group']),
    missingIds: S.Array(S.String),
  },
) {}

/** Either way a checker can break its side of the contract. */
export type CheckerContractBroken = CheckerAnsweredUnrequested | CheckerSkippedRequested

const isCheckResult = (_value: unknown): _value is CheckResult => true
const CheckResultSchema = S.Unknown.pipe(S.refine(isCheckResult))

export class CheckerCommand extends S.TaggedClass<CheckerCommand>()('CheckerCommand', {
  checkerName: S.String,
  requestedIds: S.Array(S.String),
  phase: S.Literals(['check', 'group']),
  idGroups: S.optional(S.Array(S.Array(S.String))),
  answers: S.optional(S.Record(S.String, CheckResultSchema)),
}) {}

export class CheckGroupDecision extends S.TaggedClass<CheckGroupDecision>()('CheckGroupDecision', {
  groups: S.Array(S.Array(S.String)),
}) {}

export class CheckResultDecision extends S.TaggedClass<CheckResultDecision>()('CheckResultDecision', {
  pairs: S.Array(S.Struct({ id: S.String, result: CheckResultSchema })),
}) {}

export type CheckerDecision = CheckGroupDecision | CheckResultDecision

const evaluateGroup = (command: CheckerCommand): Result.Result<CheckerDecision, CheckerContractBroken> => {
  const idGroups = command.idGroups ?? []
  const requestedRecord: Record<string, true> = Object.fromEntries(
    command.requestedIds.map((id): readonly [string, true] => [id, true]),
  )
  const flatIds = idGroups.flat()
  const unrequested = flatIds.filter((id) => !(id in requestedRecord))
  if (unrequested.length > 0) {
    return Result.fail(
      new CheckerAnsweredUnrequested({
        checkerName: command.checkerName,
        phase: 'group',
        unrequestedIds: unrequested,
        requestedIds: [...command.requestedIds],
      }),
    )
  }
  const groupedRecord: Record<string, true> = Object.fromEntries(
    flatIds.filter((id) => requestedRecord[id] === true).map((id): readonly [string, true] => [id, true]),
  )
  const missing = command.requestedIds.filter((id) => !(id in groupedRecord))
  if (missing.length > 0) {
    return Result.fail(
      new CheckerSkippedRequested({
        checkerName: command.checkerName,
        phase: 'group',
        missingIds: missing,
      }),
    )
  }
  return Result.succeed(
    new CheckGroupDecision({
      groups: idGroups.map((group) => [...group]),
    }),
  )
}

const evaluateCheckResult = (
  command: CheckerCommand,
): Result.Result<CheckerDecision, CheckerContractBroken> => {
  const answers = command.answers ?? {}
  const requestedRecord: Record<string, true> = Object.fromEntries(
    command.requestedIds.map((id): readonly [string, true] => [id, true]),
  )
  const entries = Object.entries(answers)
  const unrequested = entries.filter(([id]) => !(id in requestedRecord)).map(([id]) => id)
  if (unrequested.length > 0) {
    return Result.fail(
      new CheckerAnsweredUnrequested({
        checkerName: command.checkerName,
        phase: 'check',
        unrequestedIds: unrequested,
        requestedIds: [...command.requestedIds],
      }),
    )
  }
  const pairedRecord: Record<string, true> = Object.fromEntries(
    entries.filter(([id]) => requestedRecord[id] === true).map(([id]): readonly [string, true] => [id, true]),
  )
  const missing = command.requestedIds.filter((id) => !(id in pairedRecord))
  if (missing.length > 0) {
    return Result.fail(
      new CheckerSkippedRequested({
        checkerName: command.checkerName,
        phase: 'check',
        missingIds: missing,
      }),
    )
  }
  const pairs = entries
    .filter(([id]) => requestedRecord[id] === true)
    .map(([id, result]) => ({ id, result }))
  return Result.succeed(new CheckResultDecision({ pairs }))
}

export const admitCheckerAnswer = Workflow.make(
  CheckerCommand,
  (command: CheckerCommand): Result.Result<CheckerDecision, CheckerContractBroken> =>
    Match.value(command.phase).pipe(
      Match.when('group', () => evaluateGroup(command)),
      Match.when('check', () => evaluateCheckResult(command)),
      Match.exhaustive,
    ),
)

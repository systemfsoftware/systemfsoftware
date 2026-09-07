import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class CheckerAnsweredUnrequested extends S.TaggedError<CheckerAnsweredUnrequested>()(
  'CheckerAnsweredUnrequested',
  {
    checkerName: S.String,
    phase: S.Literals(['check', 'group']),
    unrequestedIds: S.Array(S.String),
    requestedIds: S.Array(S.String),
  },
) {}

export class CheckerSkippedRequested extends S.TaggedError<CheckerSkippedRequested>()(
  'CheckerSkippedRequested',
  {
    checkerName: S.String,
    phase: S.Literals(['check', 'group']),
    missingIds: S.Array(S.String),
  },
) {}

export type CheckerContractBroken = CheckerAnsweredUnrequested | CheckerSkippedRequested

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Array.isArray(value) === false

const isCheckResult = (value: unknown): value is CheckResult => {
  if (!isRecord(value)) {
    return false
  }
  if (value['status'] === 'passed') {
    return true
  }
  if (value['status'] === 'compileError') {
    return typeof value['reason'] === 'string'
  }
  return false
}
const CheckResultSchema = S.Unknown.pipe(S.refine(isCheckResult))

export class CheckerCommand extends S.TaggedClass<CheckerCommand>()('CheckerCommand', {
  checkerName: S.String,
  requestedIds: S.Array(S.String),
  phase: S.Literals(['check', 'group']),
  idGroups: S.optional(S.Array(S.Array(S.String))),
  answers: S.optional(S.Record(S.String, CheckResultSchema)),
}) {}

const CheckerDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-engine/CheckerDecision')
type CheckerDecisionTypeId = typeof CheckerDecisionTypeId

export class CheckGroupDecision extends S.TaggedClass<CheckGroupDecision>()('CheckGroupDecision', {
  groups: S.Array(S.Array(S.String)),
}) {
  readonly [CheckerDecisionTypeId] = CheckerDecisionTypeId
}

export class CheckResultDecision extends S.TaggedClass<CheckResultDecision>()('CheckResultDecision', {
  pairs: S.Array(S.Struct({ id: S.String, result: CheckResultSchema })),
}) {
  readonly [CheckerDecisionTypeId] = CheckerDecisionTypeId
}

export type CheckerDecision = CheckGroupDecision | CheckResultDecision

const evaluateGroup = (command: CheckerCommand): Result.Result<CheckerDecision, CheckerContractBroken> => {
  const idGroups = command.idGroups ?? []
  const requestedRecord: Record<string, true> = Object.fromEntries(
    command.requestedIds.map((id): readonly [string, true] => [id, true]),
  )
  const flatIds = idGroups.flat()
  const unrequested = flatIds.filter((id) => !(id in requestedRecord))
  return Match.value(unrequested.length > 0).pipe(
    Match.when(true, () =>
      Result.fail(
        new CheckerAnsweredUnrequested({
          checkerName: command.checkerName,
          phase: 'group',
          unrequestedIds: unrequested,
          requestedIds: [...command.requestedIds],
        }),
      )),
    Match.when(false, (): Result.Result<CheckerDecision, CheckerContractBroken> => {
      const groupedRecord: Record<string, true> = Object.fromEntries(
        flatIds.filter((id) => requestedRecord[id] === true).map((id): readonly [string, true] => [id, true]),
      )
      const missing = command.requestedIds.filter((id) => !(id in groupedRecord))
      return Match.value(missing.length > 0).pipe(
        Match.when(true, () =>
          Result.fail(
            new CheckerSkippedRequested({
              checkerName: command.checkerName,
              phase: 'group',
              missingIds: missing,
            }),
          )),
        Match.when(false, () =>
          Result.succeed(
            new CheckGroupDecision({
              groups: idGroups.map((group) => [...group]),
            }),
          )),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
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
  return Match.value(unrequested.length > 0).pipe(
    Match.when(true, () =>
      Result.fail(
        new CheckerAnsweredUnrequested({
          checkerName: command.checkerName,
          phase: 'check',
          unrequestedIds: unrequested,
          requestedIds: [...command.requestedIds],
        }),
      )),
    Match.when(false, (): Result.Result<CheckerDecision, CheckerContractBroken> => {
      const pairedRecord: Record<string, true> = Object.fromEntries(
        entries.filter(([id]) => requestedRecord[id] === true).map(([id]): readonly [string, true] => [id, true]),
      )
      const missing = command.requestedIds.filter((id) => !(id in pairedRecord))
      return Match.value(missing.length > 0).pipe(
        Match.when(true, () =>
          Result.fail(
            new CheckerSkippedRequested({
              checkerName: command.checkerName,
              phase: 'check',
              missingIds: missing,
            }),
          )),
        Match.when(false, () => {
          const pairs = entries
            .filter(([id]) => requestedRecord[id] === true)
            .map(([id, result]) => ({ id, result }))
          return Result.succeed(new CheckResultDecision({ pairs }))
        }),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )
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

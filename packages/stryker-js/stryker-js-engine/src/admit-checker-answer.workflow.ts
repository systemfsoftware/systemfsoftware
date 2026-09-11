import { Workflow } from '@systemfsoftware/effect-cell-types'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
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

const isCheckResult = (_value: unknown): _value is CheckResult => true
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

const idRecord = (ids: readonly string[]): Record<string, true> =>
  Object.fromEntries(ids.map((id): readonly [string, true] => [id, true]))

const acknowledgedIds = (
  submitted: readonly string[],
  requested: Readonly<Record<string, true>>,
): Record<string, true> => idRecord(submitted.filter((id) => requested[id] === true))

const answeredUnrequested = (
  command: CheckerCommand,
  submitted: readonly string[],
  requested: Readonly<Record<string, true>>,
): Option.Option<CheckerContractBroken> =>
  Option.liftPredicate(Arr.isReadonlyArrayNonEmpty)(submitted.filter((id) => !(id in requested))).pipe(
    Option.map(
      (unrequestedIds) =>
        new CheckerAnsweredUnrequested({
          checkerName: command.checkerName,
          phase: command.phase,
          unrequestedIds,
          requestedIds: [...command.requestedIds],
        }),
    ),
  )

const skippedRequested = (
  command: CheckerCommand,
  acknowledged: Readonly<Record<string, true>>,
): Option.Option<CheckerContractBroken> =>
  Option.liftPredicate(Arr.isReadonlyArrayNonEmpty)(command.requestedIds.filter((id) => !(id in acknowledged))).pipe(
    Option.map(
      (missingIds) =>
        new CheckerSkippedRequested({
          checkerName: command.checkerName,
          phase: command.phase,
          missingIds,
        }),
    ),
  )

/** The first contract breach the answer commits: an unrequested id outranks an unanswered one. */
const contractBreach = (
  command: CheckerCommand,
  requested: Readonly<Record<string, true>>,
  submitted: readonly string[],
): Option.Option<CheckerContractBroken> =>
  Option.firstSomeOf([
    answeredUnrequested(command, submitted, requested),
    skippedRequested(command, acknowledgedIds(submitted, requested)),
  ])

const admit = (
  command: CheckerCommand,
  requested: Readonly<Record<string, true>>,
  submitted: readonly string[],
  decision: CheckerDecision,
): Result.Result<CheckerDecision, CheckerContractBroken> =>
  Option.match(contractBreach(command, requested, submitted), {
    onNone: () => Result.succeed(decision),
    onSome: (breach) => Result.fail(breach),
  })

const idGroupsOf = (command: CheckerCommand): readonly (readonly string[])[] =>
  Option.getOrElse((): readonly (readonly string[])[] => [])(Option.fromUndefinedOr(command.idGroups))

const answersOf = (command: CheckerCommand): Record<string, CheckResult> =>
  Option.getOrElse((): Record<string, CheckResult> => ({}))(Option.fromUndefinedOr(command.answers))

const evaluateGroup = (command: CheckerCommand): Result.Result<CheckerDecision, CheckerContractBroken> => {
  const idGroups = idGroupsOf(command)
  return admit(
    command,
    idRecord(command.requestedIds),
    idGroups.flat(),
    new CheckGroupDecision({ groups: idGroups.map((group) => [...group]) }),
  )
}

const evaluateCheckResult = (command: CheckerCommand): Result.Result<CheckerDecision, CheckerContractBroken> => {
  const requested = idRecord(command.requestedIds)
  const entries = Object.entries(answersOf(command))
  const pairs = entries.filter(([id]) => requested[id] === true).map(([id, result]) => ({ id, result }))
  return admit(command, requested, entries.map(([id]) => id), new CheckResultDecision({ pairs }))
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

import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  CaseVerdict,
  SelectCase,
  selectCase,
  type SelectCaseDecision,
  type UncertainUnhandled,
} from '../select-case.workflow.js'

type Select = typeof selectCase

const decisionOf = (
  select: Select,
  cases: ReadonlyArray<CaseVerdict>,
  hasUncertainHandler: boolean,
): Result.Result<SelectCaseDecision, UncertainUnhandled> => select(new SelectCase({ cases, hasUncertainHandler }))

const projectionOf = (outcome: Result.Result<SelectCaseDecision, UncertainUnhandled>): string =>
  Result.match(outcome, {
    onFailure: (refused) => `refused:${refused.caseId}:${refused.reason}`,
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('CaseSelected', (selected) => `case:${selected.caseId}`),
        Match.tag('UncertainHandled', (handled) => `handled:${handled.caseId}:${handled.reason}`),
        Match.tag('FallbackSelected', () => 'fallback'),
        Match.exhaustive,
      ),
  })

const missedCase = (caseId: string): CaseVerdict => CaseVerdict.cases.Miss.make({ caseId })
const matchedCase = (caseId: string): CaseVerdict => CaseVerdict.cases.Match.make({ caseId })
const uncertainCase = (caseId: string, reason: string): CaseVerdict =>
  CaseVerdict.cases.Uncertain.make({ caseId, reason })

const isCaseNamed = (headId: string) => (decision: SelectCaseDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('CaseSelected', (selected) => selected.caseId === headId),
    Match.orElse(() => false),
  )

const isFallback = (decision: SelectCaseDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('FallbackSelected', () => true),
    Match.orElse(() => false),
  )

const isHandledAs = (caseId: string, reason: string) => (decision: SelectCaseDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('UncertainHandled', (handled) => handled.caseId === caseId && handled.reason === reason),
    Match.orElse(() => false),
  )

const isRefusedAs = (caseId: string, reason: string) => (refused: UncertainUnhandled): boolean =>
  Match.value(refused).pipe(
    Match.tag('UncertainUnhandled', (error) => error.caseId === caseId && error.reason === reason),
    Match.orElse(() => false),
  )

it.prop(
  '∀c_FirstMatch_=Selected',
  { of: [Schema.Array(Schema.String), Schema.String, Schema.Boolean], subject: selectCase },
  (subject, [missIds, headId, withHandler]) => {
    const cases = [...missIds.map(missedCase), matchedCase(headId)]
    return Result.match(decisionOf(subject, cases, withHandler), {
      onFailure: () => false,
      onSuccess: isCaseNamed(headId),
    })
  },
)

it.prop(
  '∀c_AllMiss_=Fallback',
  { of: [Schema.Array(Schema.String), Schema.Boolean], subject: selectCase },
  (subject, [ids, withHandler]) =>
    Result.match(decisionOf(subject, ids.map(missedCase), withHandler), {
      onFailure: () => false,
      onSuccess: isFallback,
    }),
)

it.prop(
  '∀u_WithHandler_=Handled',
  { of: [Schema.String, Schema.String], subject: selectCase },
  (subject, [caseId, reason]) =>
    Result.match(decisionOf(subject, [uncertainCase(caseId, reason)], true), {
      onFailure: () => false,
      onSuccess: isHandledAs(caseId, reason),
    }),
)

it.prop(
  '∀u_WithoutHandler_=Refused',
  { of: [Schema.String, Schema.String], subject: selectCase },
  (subject, [caseId, reason]) =>
    Result.match(decisionOf(subject, [uncertainCase(caseId, reason)], false), {
      onFailure: isRefusedAs(caseId, reason),
      onSuccess: () => false,
    }),
)

const isMissedItem = (item: CaseVerdict): boolean => CaseVerdict.guards.Miss(item)

const truncateAtFirstDecisive = (cases: ReadonlyArray<CaseVerdict>): ReadonlyArray<CaseVerdict> => {
  const misses = Arr.takeWhile(cases, isMissedItem)
  return Option.match(Arr.head(Arr.drop(cases, misses.length)), {
    onNone: () => misses,
    onSome: (decisive) => [...misses, decisive],
  })
}

it.prop(
  '∀c_Decision_=PrefixStable',
  { of: [Schema.Array(CaseVerdict), Schema.Boolean], subject: selectCase },
  (subject, [cases, withHandler]) => {
    const full = projectionOf(decisionOf(subject, cases, withHandler))
    const truncated = projectionOf(decisionOf(subject, truncateAtFirstDecisive(cases), withHandler))
    return full === truncated
  },
)

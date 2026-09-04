import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { ExitClass } from './ExitClass.schema.js'

export class ClassifyExitCommand extends S.TaggedClass<ClassifyExitCommand>()('ClassifyExitCommand', {
  pending: S.Array(ExitClass),
  signal: S.NullOr(S.Number),
  score: S.NullOr(S.Number),
  breakingThreshold: S.NullOr(S.Number),
}) {}

export class ClassifyExitDecision extends S.TaggedClass<ClassifyExitDecision>()('ClassifyExitDecision', {
  highestClass: S.NullOr(ExitClass),
  verdictClass: S.NullOr(ExitClass),
}) {}

export class ClassifyExitError extends S.TaggedError<ClassifyExitError>()('ClassifyExitError', {
  message: S.String,
}) {}

const deriveVerdict = (
  score: number | null,
  breakingThreshold: number | null,
): typeof ExitClass.Type | null => {
  if (score === null || breakingThreshold === null) {
    return null
  }
  if (score < breakingThreshold) {
    return 'VerdictFail'
  }
  return null
}

const rank = (value: typeof ExitClass.Type): number =>
  Match.value(value).pipe(
    Match.when('InternalError', () => 4),
    Match.when('RuntimeError', () => 3),
    Match.when('ConfigError', () => 2),
    Match.when('VerdictFail', () => 1),
    Match.exhaustive,
  )

const withVerdict = (
  pending: ReadonlyArray<typeof ExitClass.Type>,
  verdict: typeof ExitClass.Type | null,
): ReadonlyArray<typeof ExitClass.Type> => {
  if (verdict === null) {
    return pending
  }
  if (pending.includes(verdict)) {
    return pending
  }
  return [...pending, verdict]
}

const highestOf = (values: ReadonlyArray<typeof ExitClass.Type>): typeof ExitClass.Type | null =>
  values.reduce<typeof ExitClass.Type | null>((acc, cur) => {
    if (acc === null) {
      return cur
    }
    if (rank(cur) > rank(acc)) {
      return cur
    }
    return acc
  }, null)

export const classifyExit = Workflow.make(
  ClassifyExitCommand,
  (command: ClassifyExitCommand): Result.Result<ClassifyExitDecision, ClassifyExitError> => {
    const verdictClass = deriveVerdict(command.score, command.breakingThreshold)
    const pendingWithVerdict = withVerdict(command.pending, verdictClass)
    const highestClass = highestOf(pendingWithVerdict)
    return Result.succeed(
      ClassifyExitDecision.make({
        highestClass,
        verdictClass,
      }),
    )
  },
)

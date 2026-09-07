import * as S from 'effect/Schema'

export const ExitClass = S.Literals(['VerdictFail', 'ConfigError', 'RuntimeError', 'InternalError'])

export type ExitClass = typeof ExitClass.Type

const Percentage = S.Finite.pipe(S.check(S.isBetween({ minimum: 0, maximum: 100 })))

export class ClassifyExitCommand extends S.TaggedClass<ClassifyExitCommand>()('ClassifyExitCommand', {
  pending: S.Array(ExitClass),
  signal: S.NullOr(S.Finite),
  score: S.NullOr(Percentage),
  breakingThreshold: S.NullOr(Percentage),
}) {}

export class ClassifyExitDecision extends S.TaggedClass<ClassifyExitDecision>()('ClassifyExitDecision', {
  highestClass: S.NullOr(ExitClass),
  verdictClass: S.NullOr(ExitClass),
}) {}

import * as S from 'effect/Schema'

export const ExitClass = S.Literals(['VerdictFail', 'ConfigError', 'RuntimeError', 'InternalError'])

export type ExitClass = typeof ExitClass.Type

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

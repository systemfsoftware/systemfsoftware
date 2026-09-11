import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import { type ClassifyExitCommand, ClassifyExitDecision, type ExitClass } from './ExitClass.schema.js'

export { ExitClass } from './ExitClass.schema.js'

export const EXIT_CODE: Record<ExitClass, number> = {
  VerdictFail: 1,
  ConfigError: 2,
  RuntimeError: 3,
  InternalError: 4,
}

export function highestExitClass(pending: Iterable<ExitClass>): ExitClass | null {
  return Array.from(pending).reduce<ExitClass | null>(
    (incumbent, challenger) =>
      Option.match(Option.fromNullishOr(incumbent), {
        onNone: () => challenger,
        onSome: (value) =>
          Match.value(EXIT_CODE[value] < EXIT_CODE[challenger]).pipe(
            Match.when(true, () => challenger),
            Match.when(false, () => value),
            Match.exhaustive,
          ),
      }),
    null,
  )
}

export function resolveExitCode(pending: Iterable<ExitClass>, signal: number | null): number {
  return Option.match(Option.fromNullishOr(signal), {
    onNone: () =>
      Option.match(Option.fromNullishOr(highestExitClass(pending)), {
        onNone: () => 0,
        onSome: (exitClass) => EXIT_CODE[exitClass],
      }),
    onSome: (value) => 128 + value,
  })
}

export function verdictExitClass(score: number | null, breakingThreshold: number | null): ExitClass | null {
  return Option.getOrNull(
    Option.zipWith(
      Option.fromNullishOr(score),
      Option.fromNullishOr(breakingThreshold),
      (value, threshold): ExitClass | null =>
        Match.value(value < threshold).pipe(
          Match.when(true, (): ExitClass => 'VerdictFail'),
          Match.when(false, () => null),
          Match.exhaustive,
        ),
    ),
  )
}

export const classifyExit = (command: ClassifyExitCommand): ClassifyExitDecision => {
  const verdictClass = verdictExitClass(command.score, command.breakingThreshold)
  const highestClass = highestExitClass(
    Option.match(Option.fromNullishOr(verdictClass), {
      onNone: () => command.pending,
      onSome: (verdict) => Array.from(new Set([...command.pending, verdict])),
    }),
  )
  return ClassifyExitDecision.make({
    highestClass,
    verdictClass,
  })
}

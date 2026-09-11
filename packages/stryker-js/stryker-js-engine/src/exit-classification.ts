import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

export { ExitClass } from './exit-classification.schema.js'
import type { ExitClass } from './exit-classification.schema.js'

export const EXIT_CODE: Record<ExitClass, number> = {
  VerdictFail: 1,
  ConfigError: 2,
  RuntimeError: 3,
  InternalError: 4,
}

export function verdictExitClass(
  score: number | null,
  breakingThreshold: number | null,
): ExitClass | null {
  return Option.match(
    Option.all([Option.fromNullishOr(score), Option.fromNullishOr(breakingThreshold)]),
    {
      onNone: (): ExitClass | null => null,
      onSome: ([actual, threshold]) =>
        Match.value(actual < threshold).pipe(
          Match.when(true, (): ExitClass => 'VerdictFail'),
          Match.when(false, (): ExitClass | null => null),
          Match.exhaustive,
        ),
    },
  )
}

export function resolveExitCode(
  pending: Iterable<ExitClass>,
  signal: number | null,
): number {
  return Match.value(signal).pipe(
    Match.when(null, () =>
      Option.match(Option.fromNullishOr(highestExitClass(pending)), {
        onNone: () => 0,
        onSome: (highest) => EXIT_CODE[highest],
      })),
    Match.orElse((present) => 128 + present),
  )
}

export function highestExitClass(pending: Iterable<ExitClass>): ExitClass | null {
  return [...pending].reduce<ExitClass | null>(
    (highest, candidate) =>
      Option.match(Option.fromNullishOr(highest), {
        onNone: () => candidate,
        onSome: (current) =>
          Match.value(EXIT_CODE[candidate] > EXIT_CODE[current]).pipe(
            Match.when(true, (): ExitClass => candidate),
            Match.when(false, (): ExitClass => current),
            Match.exhaustive,
          ),
      }),
    null,
  )
}

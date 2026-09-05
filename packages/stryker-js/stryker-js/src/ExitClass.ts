import * as Match from 'effect/Match'

import { type ClassifyExitCommand, ClassifyExitDecision, type ExitClass } from './ExitClass.schema.js'

export { ExitClass } from './ExitClass.schema.js'

export const EXIT_CODE: Record<ExitClass, number> = {
  VerdictFail: 1,
  ConfigError: 2,
  RuntimeError: 3,
  InternalError: 4,
}

export function verdictExitClass(score: number | null, breakingThreshold: number | null): ExitClass | null {
  if (breakingThreshold === null || score === null) {
    return null
  }
  if (score < breakingThreshold) {
    return 'VerdictFail'
  }
  return null
}

export function highestExitClass(pending: Iterable<ExitClass>): ExitClass | null {
  let highest: ExitClass | null = null
  for (const exitClass of pending) {
    if (highest === null || EXIT_CODE[exitClass] > EXIT_CODE[highest]) {
      highest = exitClass
    }
  }
  return highest
}

export function resolveExitCode(pending: Iterable<ExitClass>, signal: number | null): number {
  if (signal !== null) {
    return 128 + signal
  }
  const highest = highestExitClass(pending)
  if (highest === null) {
    return 0
  }
  return EXIT_CODE[highest]
}

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

export const classifyExit = (command: ClassifyExitCommand): ClassifyExitDecision => {
  const verdictClass = deriveVerdict(command.score, command.breakingThreshold)
  const pendingWithVerdict = withVerdict(command.pending, verdictClass)
  const highestClass = highestOf(pendingWithVerdict)
  return ClassifyExitDecision.make({
    highestClass,
    verdictClass,
  })
}

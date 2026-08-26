export { ExitClass } from './ExitClass.schema.js'
import type { ExitClass } from './ExitClass.schema.js'

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

export { ClassifyExitCommandSchema, ClassifyExitDecisionSchema, ExitClassSchema } from './ExitClass.schema.js'

export type ExitClass = 'VerdictFail' | 'ConfigError' | 'RuntimeError' | 'InternalError'

export const EXIT_CODE: Record<ExitClass, number> = {
  VerdictFail: 1,
  ConfigError: 2,
  RuntimeError: 3,
  InternalError: 4,
}

export interface ClassifyExitCommand {
  readonly pending: readonly ExitClass[]
  readonly signal: number | null
  readonly score: number | null
  readonly breakingThreshold: number | null
}

export interface ClassifyExitDecision {
  readonly highestClass: ExitClass | null
  readonly verdictClass: ExitClass | null
}

const higher = (incumbent: ExitClass, challenger: ExitClass): ExitClass => {
  if (EXIT_CODE[incumbent] < EXIT_CODE[challenger]) return challenger
  return incumbent
}

const higherOf = (incumbent: ExitClass | null, challenger: ExitClass): ExitClass => {
  if (incumbent === null) return challenger
  return higher(incumbent, challenger)
}

export const highestExitClass = (pending: Iterable<ExitClass>): ExitClass | null =>
  Array.from(pending).reduce<ExitClass | null>(higherOf, null)

const codeOf = (pending: Iterable<ExitClass>): number => {
  const highest = highestExitClass(pending)
  if (highest === null) return 0
  return EXIT_CODE[highest]
}

export const resolveExitCode = (pending: Iterable<ExitClass>, signal: number | null): number => {
  if (signal !== null) return 128 + signal
  return codeOf(pending)
}

const belowThreshold = (score: number, breakingThreshold: number): ExitClass | null => {
  if (score < breakingThreshold) return 'VerdictFail'
  return null
}

const isThresholdPair = (values: readonly (number | null)[]): values is readonly [number, number] =>
  values.length === 2 && values.every((value) => value !== null)

export const verdictExitClass = (score: number | null, breakingThreshold: number | null): ExitClass | null => {
  const present = [score, breakingThreshold]
  if (!isThresholdPair(present)) return null
  return belowThreshold(present[0], present[1])
}

export const classifyExit = (command: ClassifyExitCommand): ClassifyExitDecision => {
  const verdictClass = verdictExitClass(command.score, command.breakingThreshold)
  if (verdictClass === null) {
    return { highestClass: highestExitClass(command.pending), verdictClass }
  }
  return { highestClass: highestExitClass([...command.pending, verdictClass]), verdictClass }
}

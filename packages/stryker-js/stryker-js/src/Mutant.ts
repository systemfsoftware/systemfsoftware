import type { MutantRunOptions } from './TestRunner.js'

export { LocationSchema, MutantSchema, MutantStatusSchema, PositionSchema } from './Mutant.schema.js'
export type { Location, Mutant, MutantStatus, Position } from './Mutant.schema.js'

import type { Mutant, MutantStatus, Position } from './Mutant.schema.js'

export type CoverageData = Record<string, number>

export type CoveragePerTestId = Record<string, CoverageData>

export interface Coverage {
  readonly static: CoverageData
  readonly perTest: CoveragePerTestId
}

export interface EarlyResultPlan {
  readonly plan: 'EarlyResult'
  readonly mutant: Mutant
}

export interface RunPlan {
  readonly plan: 'Run'
  readonly mutant: Mutant
  readonly runOptions: MutantRunOptions
  readonly netTime: number
}

export type TestPlan = EarlyResultPlan | RunPlan

export type MutantTestCoverage = Mutant & {
  readonly coveredBy: ReadonlyArray<string> | undefined
  readonly static: boolean | undefined
}

export type MutantResult = Mutant & {
  readonly status: MutantStatus
  readonly statusReason?: string | undefined
  readonly testsCompleted?: number | undefined
  readonly killedBy?: readonly string[] | undefined
  readonly coveredBy?: readonly string[] | undefined
  readonly static?: boolean | undefined
}

export const INSTRUMENTER_CONSTANTS = Object.freeze({
  NAMESPACE: '__stryker__' as const,
  MUTATION_COVERAGE_OBJECT: 'mutantCoverage' as const,
  ACTIVE_MUTANT: 'activeMutant' as const,
  CURRENT_TEST_ID: 'currentTestId' as const,
  HIT_COUNT: 'hitCount' as const,
  HIT_LIMIT: 'hitLimit' as const,
  ACTIVE_MUTANT_ENV_VARIABLE: '__STRYKER_ACTIVE_MUTANT__' as const,
})

export interface InstrumenterContext {
  activeMutant?: string
  currentTestId?: string
  mutantCoverage?: MutantCoverage
  hitCount?: number
  hitLimit?: number
}

export type MutantCoverage = Coverage

export function normalizeFileName(fileName: string): string {
  return fileName.replace(/\\/g, '/')
}

export interface MutationRange {
  readonly start: Position
  readonly end: Position
}

export type MutateDescription = ReadonlyArray<MutationRange> | boolean

export interface FileDescription {
  readonly mutate: MutateDescription
}

export type FileDescriptions = Record<string, FileDescription>

export type MutantRunPlan = RunPlan

export type MutantEarlyResultPlan = EarlyResultPlan

export type MutantTestPlan = TestPlan

const TAG_OF_MUTANT = 'Mutant'

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null

const carriesMutantTag = (value: object): boolean => Reflect.get(value, '_tag') === TAG_OF_MUTANT

export const isMutant = (value: unknown): value is Mutant => isObject(value) && carriesMutantTag(value)

import type { MutantRunOptions } from './TestRunner.js'

import { Mutant } from './Mutant.schema.js'
import type { Position } from './Mutant.schema.js'

export { LocationSchema, Mutant, PositionSchema } from './Mutant.schema.js'
export type { Location, Position } from './Mutant.schema.js'

export type CoverageData = Record<string, number>

export type CoveragePerTestId = Record<string, CoverageData>

export interface Coverage {
  readonly static: CoverageData
  readonly perTest: CoveragePerTestId
}

export type MutantStatus =
  | 'Killed'
  | 'Survived'
  | 'NoCoverage'
  | 'Timeout'
  | 'CompileError'
  | 'RuntimeError'
  | 'Ignored'
  | 'Pending'

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

export const isMutant = (value: unknown): value is Mutant => value instanceof Mutant

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

export interface ErrnoException extends Error {
  code?: string
  errno?: number
  path?: string
  syscall?: string
}

export function isErrnoException(error: unknown): error is ErrnoException {
  if (!(error instanceof Error)) {
    return false
  }
  if (!('code' in error)) {
    return false
  }
  const code: unknown = Reflect.get(error, 'code')
  return typeof code === 'string'
}

const isEmptyError = (error: unknown): boolean => {
  if (error === undefined || error === null) {
    return true
  }
  if (typeof error === 'string' && error.length === 0) {
    return true
  }
  if (error === 0 || error === false) {
    return true
  }
  if (typeof error === 'number' && Number.isNaN(error)) {
    return true
  }
  return false
}

const formatErrnoException = (error: ErrnoException): string => {
  const stack = error.stack
  if (stack !== undefined && stack.length > 0) {
    return `${error.name}: ${error.code} (${error.syscall}) ${stack}`
  }
  return `${error.name}: ${error.code} (${error.syscall})`
}

const formatError = (error: Error): string => {
  const message = `${error.name}: ${error.message}`
  if (error.stack !== undefined && error.stack.length > 0) {
    return `${message}\n${error.stack.toString()}`
  }
  return message
}

const stringifyNonError = (error: unknown): string => {
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return JSON.stringify(error)
  }
  try {
    const json = JSON.stringify(error)
    if (typeof json === 'string' && json.length > 0) {
      return json
    }
  } catch {
    // fall through
  }
  if (typeof error === 'object' && error !== null && 'toString' in error) {
    const toStringValue: unknown = Reflect.get(error, 'toString')
    if (typeof toStringValue === 'function') {
      try {
        const text: unknown = Reflect.apply(toStringValue, error, [])
        if (typeof text === 'string' && text.length > 0 && text !== '[object Object]') {
          return text
        }
      } catch {
        // fall through
      }
    }
  }
  return ''
}

export function errorToString(error: unknown): string {
  if (isEmptyError(error)) {
    return ''
  }
  if (error instanceof Error) {
    if (isErrnoException(error)) {
      return formatErrnoException(error)
    }
    return formatError(error)
  }
  return stringifyNonError(error)
}

export const ERROR_CODES = Object.freeze({ NoSuchFileOrDirectory: 'ENOENT' as const })
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

export * as schema from 'mutation-testing-report-schema/api'

const stringField = (value: object, key: string): string | undefined => {
  if (!(key in value)) {
    return undefined
  }
  const field: unknown = Reflect.get(value, key)
  if (typeof field === 'string' && field.length > 0) {
    return field
  }
  return undefined
}

const tagOf = (value: object): string | undefined => {
  let tag: unknown
  if ('_tag' in value) {
    tag = Reflect.get(value, '_tag')
  } else {
    tag = undefined
  }
  if (typeof tag === 'string' && tag.length > 0) {
    return tag
  }
  if (value instanceof Error && value.name.length > 0) {
    return value.name
  }
  return undefined
}

export const causeText = (cause: unknown, depth: number): string | undefined => {
  if (depth > 4 || cause === undefined || cause === null) {
    return undefined
  }
  if (typeof cause === 'string') {
    if (cause.length > 0) {
      return cause
    }
    return undefined
  }
  if (typeof cause !== 'object') {
    return undefined
  }
  let own: string | undefined
  const reason = stringField(cause, 'reason')
  if (reason !== undefined) {
    own = reason
  } else {
    const message = stringField(cause, 'message')
    if (message !== undefined) {
      own = message
    } else {
      if (cause instanceof Error && cause.message.length > 0) {
        own = cause.message
      } else {
        own = tagOf(cause)
      }
    }
  }
  let nested: string | undefined
  if ('cause' in cause) {
    nested = causeText(Reflect.get(cause, 'cause'), depth + 1)
  } else {
    nested = undefined
  }
  if (own === undefined) {
    return nested
  }
  if (nested === undefined) {
    return own
  }
  return `${own}: ${nested}`
}

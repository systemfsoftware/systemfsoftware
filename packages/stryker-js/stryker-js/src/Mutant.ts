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

type Callable = (...args: readonly unknown[]) => unknown

interface ErrnoException extends Error {
  code?: string
  errno?: number
  path?: string
  syscall?: string
}

const hasText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const textIfNonEmpty = (value: unknown): string | undefined => {
  if (!hasText(value)) return undefined
  return value
}

const fieldOf = (value: object, key: string): unknown => {
  if (!(key in value)) return undefined
  const field: unknown = Reflect.get(value, key)
  return field
}

const isErrnoException = (error: unknown): error is ErrnoException => {
  if (!(error instanceof Error)) return false
  return typeof fieldOf(error, 'code') === 'string'
}

const EMPTY_ERRORS: ReadonlySet<unknown> = new Set([undefined, null, '', 0, Number.NaN, false])

const formatErrnoException = (error: ErrnoException): string => {
  if (!hasText(error.stack)) return `${error.name}: ${error.code} (${error.syscall})`
  return `${error.name}: ${error.code} (${error.syscall}) ${error.stack}`
}

const formatError = (error: Error): string => {
  if (!hasText(error.stack)) return `${error.name}: ${error.message}`
  return `${error.name}: ${error.message}\n${error.stack}`
}

const errorText = (error: Error): string => {
  if (isErrnoException(error)) return formatErrnoException(error)
  return formatError(error)
}

const JSON_PRIMITIVE_TYPES: Readonly<Record<string, true>> = { number: true, boolean: true, bigint: true }

const jsonText = (error: unknown): string | undefined => {
  try {
    return textIfNonEmpty(JSON.stringify(error))
  } catch {
    return undefined
  }
}

const isNonPlaceholderText = (text: string): boolean => text.length > 0 && text !== '[object Object]'

const isUsableText = (value: unknown): value is string => typeof value === 'string' && isNonPlaceholderText(value)

const usableText = (value: unknown): string => {
  if (!isUsableText(value)) return ''
  return value
}

const isCallable = (value: unknown): value is Callable => typeof value === 'function'

const appliedToString = (value: object, callable: Callable): string => {
  try {
    const text: unknown = Reflect.apply(callable, value, [])
    return usableText(text)
  } catch {
    return ''
  }
}

const objectToStringText = (value: object): string => {
  const callable = fieldOf(value, 'toString')
  if (!isCallable(callable)) return ''
  return appliedToString(value, callable)
}

const toStringText = (error: unknown): string => {
  if (!isObject(error)) return ''
  return objectToStringText(error)
}

const stringifyRest = (error: unknown): string => {
  const json = jsonText(error)
  if (!hasText(json)) return toStringText(error)
  return json
}

const primitiveOrRestText = (error: unknown): string => {
  if (Object.hasOwn(JSON_PRIMITIVE_TYPES, typeof error)) return JSON.stringify(error)
  return stringifyRest(error)
}

const stringifyNonError = (error: unknown): string => {
  if (typeof error === 'string') return error
  return primitiveOrRestText(error)
}

const presentErrorText = (error: unknown): string => {
  if (!(error instanceof Error)) return stringifyNonError(error)
  return errorText(error)
}

export function errorToString(error: unknown): string {
  if (EMPTY_ERRORS.has(error)) return ''
  return presentErrorText(error)
}

const errorNameOf = (value: object): string | undefined => {
  if (!(value instanceof Error)) return undefined
  return textIfNonEmpty(value.name)
}

const tagOf = (value: object): string | undefined => {
  const tag = textIfNonEmpty(fieldOf(value, '_tag'))
  if (hasText(tag)) return tag
  return errorNameOf(value)
}

const appendNested = (own: string, nested: string | undefined): string => {
  if (!hasText(nested)) return own
  return `${own}: ${nested}`
}

const textWithNested = (own: string | undefined, nested: string | undefined): string | undefined => {
  if (!hasText(own)) return nested
  return appendNested(own, nested)
}

const errorMessage = (error: Error): string | undefined => {
  if (error.message.length === 0) return tagOf(error)
  return error.message
}

const errorMessageOrTag = (value: object): string | undefined => {
  if (!(value instanceof Error)) return tagOf(value)
  return errorMessage(value)
}

const messageText = (value: object): string | undefined => {
  const message = textIfNonEmpty(fieldOf(value, 'message'))
  if (!hasText(message)) return errorMessageOrTag(value)
  return message
}

const ownCauseText = (value: object): string | undefined => {
  const reason = textIfNonEmpty(fieldOf(value, 'reason'))
  if (!hasText(reason)) return messageText(value)
  return reason
}

const isAbsent = (cause: unknown): boolean => cause === undefined || cause === null

const deepOrAbsent = (cause: unknown, depth: number): boolean => depth > 4 || isAbsent(cause)

const objectCauseText = (cause: unknown, depth: number): string | undefined => {
  if (!isObject(cause)) return undefined
  return textWithNested(ownCauseText(cause), causeText(fieldOf(cause, 'cause'), depth + 1))
}

const presentCauseText = (cause: unknown, depth: number): string | undefined => {
  if (typeof cause === 'string') return textIfNonEmpty(cause)
  return objectCauseText(cause, depth)
}

export function causeText(cause: unknown, depth: number): string | undefined {
  if (deepOrAbsent(cause, depth)) return undefined
  return presentCauseText(cause, depth)
}

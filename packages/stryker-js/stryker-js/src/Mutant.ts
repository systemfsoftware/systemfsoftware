import * as Match from 'effect/Match'

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

const hasText = (value: unknown): value is string =>
  Match.value(value).pipe(
    Match.when(Match.string, (text) => text.length > 0),
    Match.orElse(() => false),
  )

const textIfNonEmpty = (value: unknown): string | undefined =>
  Match.value(value).pipe(
    Match.when(hasText, (text) => text),
    Match.orElse(() => undefined),
  )

const fieldOf = (value: object, key: string): unknown =>
  Match.value(key in value).pipe(
    Match.when(true, () => {
      const field: unknown = Reflect.get(value, key)
      return field
    }),
    Match.orElse(() => undefined),
  )

const hasStringCode = (error: Error): boolean =>
  Match.value(fieldOf(error, 'code')).pipe(
    Match.when(Match.string, () => true),
    Match.orElse(() => false),
  )

export function isErrnoException(error: unknown): error is ErrnoException {
  return Match.value(error).pipe(
    Match.when(Match.instanceOf(Error), hasStringCode),
    Match.orElse(() => false),
  )
}

const isEmptyNumber = (value: number): boolean =>
  Match.value(value).pipe(
    Match.when(0, () => true),
    Match.orElse(Number.isNaN),
  )

const isEmptyError = (error: unknown): boolean =>
  Match.value(error).pipe(
    Match.when(Match.undefined, () => true),
    Match.when(Match.null, () => true),
    Match.when(Match.string, (text) => text.length === 0),
    Match.when(Match.number, isEmptyNumber),
    Match.when(Match.boolean, (value) => !value),
    Match.orElse(() => false),
  )

const formatErrnoException = (error: ErrnoException): string =>
  Match.value(error.stack).pipe(
    Match.when(hasText, (stack) => `${error.name}: ${error.code} (${error.syscall}) ${stack}`),
    Match.orElse(() => `${error.name}: ${error.code} (${error.syscall})`),
  )

const formatError = (error: Error): string =>
  Match.value(error.stack).pipe(
    Match.when(hasText, (stack) => `${error.name}: ${error.message}\n${stack}`),
    Match.orElse(() => `${error.name}: ${error.message}`),
  )

const isJsonPrimitive = (value: unknown): value is number | boolean | bigint =>
  Match.value(value).pipe(
    Match.when(Match.number, () => true),
    Match.when(Match.boolean, () => true),
    Match.when(Match.bigint, () => true),
    Match.orElse(() => false),
  )

const jsonText = (error: unknown): string | undefined => {
  try {
    return textIfNonEmpty(JSON.stringify(error))
  } catch {
    return undefined
  }
}

const isNonPlaceholderText = (text: string): boolean =>
  Match.value({ hasLength: text.length > 0, isPlaceholder: text === '[object Object]' }).pipe(
    Match.when({ hasLength: true, isPlaceholder: false }, () => true),
    Match.orElse(() => false),
  )

const isUsableText = (value: unknown): value is string =>
  Match.value(value).pipe(
    Match.when(Match.string, isNonPlaceholderText),
    Match.orElse(() => false),
  )

const usableText = (value: unknown): string =>
  Match.value(value).pipe(
    Match.when(isUsableText, (text) => text),
    Match.orElse(() => ''),
  )

const objectToStringText = (value: object): string =>
  Match.value(fieldOf(value, 'toString')).pipe(
    Match.when(Match.instanceOf(Function), (callable) => {
      try {
        return usableText(Reflect.apply(callable, value, []))
      } catch {
        return ''
      }
    }),
    Match.orElse(() => ''),
  )

const isObjectType = (cause: unknown): cause is object => typeof cause === 'object'

const toStringText = (error: unknown): string =>
  Match.value(error).pipe(
    Match.when(Match.null, () => ''),
    Match.when(isObjectType, (value) => objectToStringText(value)),
    Match.orElse(() => ''),
  )

const stringifyRest = (error: unknown): string =>
  Match.value(jsonText(error)).pipe(
    Match.when(hasText, (json) => json),
    Match.orElse(() => toStringText(error)),
  )

const stringifyNonError = (error: unknown): string =>
  Match.value(error).pipe(
    Match.when(Match.string, (text) => text),
    Match.when(isJsonPrimitive, (primitive) => JSON.stringify(primitive)),
    Match.orElse(() => stringifyRest(error)),
  )

const errorText = (error: Error): string =>
  Match.value(error).pipe(
    Match.when(isErrnoException, formatErrnoException),
    Match.orElse(() => formatError(error)),
  )

export function errorToString(error: unknown): string {
  return Match.value(error).pipe(
    Match.when(isEmptyError, () => ''),
    Match.when(Match.instanceOf(Error), errorText),
    Match.orElse(() => stringifyNonError(error)),
  )
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

export * as schema from './Report.schema.js'

const errorNameOf = (value: object): string | undefined =>
  Match.value(value).pipe(
    Match.when(Match.instanceOf(Error), (error) => textIfNonEmpty(error.name)),
    Match.orElse(() => undefined),
  )

const tagOf = (value: object): string | undefined =>
  Match.value(textIfNonEmpty(fieldOf(value, '_tag'))).pipe(
    Match.when(hasText, (tag) => tag),
    Match.orElse(() => errorNameOf(value)),
  )

const textWithNested = (own: string | undefined, nested: string | undefined): string | undefined =>
  Match.value(own).pipe(
    Match.when(hasText, (text) => appendNested(text, nested)),
    Match.orElse(() => nested),
  )

const appendNested = (own: string, nested: string | undefined): string =>
  Match.value(nested).pipe(
    Match.when(hasText, (text) => `${own}: ${text}`),
    Match.orElse(() => own),
  )

const errorMessage = (error: Error): string | undefined =>
  Match.value(error.message.length > 0).pipe(
    Match.when(true, () => error.message),
    Match.orElse(() => tagOf(error)),
  )

const errorMessageOrTag = (value: object): string | undefined =>
  Match.value(value).pipe(
    Match.when(Match.instanceOf(Error), errorMessage),
    Match.orElse(() => tagOf(value)),
  )

const messageText = (value: object): string | undefined =>
  Match.value(textIfNonEmpty(fieldOf(value, 'message'))).pipe(
    Match.when(hasText, (message) => message),
    Match.orElse(() => errorMessageOrTag(value)),
  )

const ownCauseText = (value: object): string | undefined =>
  Match.value(textIfNonEmpty(fieldOf(value, 'reason'))).pipe(
    Match.when(hasText, (reason) => reason),
    Match.orElse(() => messageText(value)),
  )

export const causeText = (cause: unknown, depth: number): string | undefined =>
  Match.value(cause).pipe(
    Match.when(() => depth > 4, () => undefined),
    Match.when(Match.undefined, () => undefined),
    Match.when(Match.null, () => undefined),
    Match.when(Match.string, textIfNonEmpty),
    Match.when(isObjectType, (value) =>
      textWithNested(ownCauseText(value), causeText(fieldOf(value, 'cause'), depth + 1))),
    Match.orElse(() =>
      undefined
    ),
  )

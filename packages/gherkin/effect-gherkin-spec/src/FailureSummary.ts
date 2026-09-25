import { Option } from 'effect'

type AnyValue<A = unknown> = A

export interface StepFailure {
  readonly keyword: string
  readonly text: string
  readonly cause: AnyValue
}

const NEWLINE = '\n'
const UNPRINTABLE = 'unprintable'
const RESERVED_FIELDS: Record<string, true> = { _tag: true, cause: true }

const isNullish = (value: unknown): value is null | undefined => value === null || value === undefined
const isErrorValue = (value: unknown): value is Error => value instanceof Error
const isBigIntValue = (value: unknown): value is bigint => typeof value === 'bigint'
const isTextField = (value: unknown): value is string => typeof value === 'string'
const isFieldEntry = (key: string): boolean => RESERVED_FIELDS[key] !== true

const firstLineOf = (text: string): string => text.split(NEWLINE)[0] ?? ''

const ownField = (error: Error, name: string): AnyValue => Object.getOwnPropertyDescriptor(error, name)?.value

const textOrNone = (value: AnyValue): Option.Option<string> =>
  Option.fromNullishOr(isTextField(value) ? value : undefined)

const errorName = (error: Error): string => Option.getOrElse(textOrNone(ownField(error, '_tag')), () => error.name)

const fieldsText = (error: Error): string =>
  JSON.stringify(Object.fromEntries(Object.entries(error).filter(([key]) => isFieldEntry(key))))

const errorSummary = (error: Error): string =>
  error.message === ''
    ? `${errorName(error)} ${fieldsText(error)}`
    : `${errorName(error)}: ${firstLineOf(error.message)}`

const jsonText = (value: AnyValue): string =>
  Option.getOrElse(Option.fromNullishOr(JSON.stringify(value)), () => UNPRINTABLE)

const valueSummary = (value: AnyValue): string => (isBigIntValue(value) ? `${value}n` : jsonText(value))

const summaryWithError = (cause: AnyValue): string => isErrorValue(cause) ? errorSummary(cause) : valueSummary(cause)

const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

const headline = (failure: StepFailure): string => `${capitalized(failure.keyword)} "${failure.text}" failed`

const failureSummary = (cause: AnyValue): string => (isNullish(cause) ? '' : summaryWithError(cause))

export const failureMessage = (failure: StepFailure): string => {
  const summary = failureSummary(failure.cause)
  return summary === '' ? headline(failure) : `${headline(failure)}: ${summary}`
}

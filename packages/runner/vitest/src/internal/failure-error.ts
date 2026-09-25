/**
 * The Error Vitest prints for one record (R2, R7, R8): its `name` is the record's failure tag, its `message` is the
 * record, and its `stack` leads with that message — Vitest's JSON reporter hands a consumer `stack || message`, so
 * the record has to ride there too — followed by the record's first location, so no `effect` or library frame stays.
 * The tag is left out of the message because Vitest prints `name: message`: the tag would otherwise lead twice.
 *
 * A failure that carries a diff — Chai's `actual`, `expected`, `showDiff`, `operator` and Vitest's `diff` — has
 * those fields copied from the innermost layer that holds them, because Vitest renders its Expected/Received block
 * from the thrown error, not from the record text.
 *
 * @since 4.0.0
 */
import * as Cause from 'effect/Cause'
import type { FailureRecord, FailureRecordInput } from './failure-record.js'
import { renderFailureRecord } from './failure-record.js'

type Opaque<A = unknown> = A

const LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

/** The mark a rendered record's Error carries, so a throw site that receives one passes it through unchanged. */
const RECORD = Symbol.for('@systemfsoftware/vitest/FailureRecord')

/** The fields Vitest reads to render its diff; each is copied only when the layer actually holds one. */
const DIFF_FIELDS: ReadonlyArray<string> = ['actual', 'expected', 'showDiff', 'operator', 'diff']

const CAUSE_DEPTH = 8

const isObject = (value: Opaque): value is object => typeof value === 'object' && value !== null

const objectOrUndefined = (value: Opaque): object | undefined => isObject(value) ? value : undefined

const fieldOf = (value: object, key: string | symbol): Opaque => Reflect.get(value, key)

const isDiffLayer = (value: object): boolean => fieldOf(value, 'actual') !== undefined

const marked = (error: Error): Error => {
  Object.defineProperty(error, RECORD, { value: true })
  return error
}

const siteOf = (text: string): string | undefined => LOCATION.exec(text)?.[0]

const withoutTag = (record: FailureRecord): string => {
  const prefix = `${record.name}: `
  return record.record.startsWith(prefix) ? record.record.slice(prefix.length) : record.record
}

const stackOf = (record: FailureRecord, message: string): string => {
  const head = `${record.name}: ${message}`
  const site = siteOf(record.record)
  return site === undefined ? head : `${head}\n    at ${site}`
}

const withStack = (error: Error, record: FailureRecord, message: string): Error => {
  error.stack = stackOf(record, message)
  return error
}

const withName = (error: Error, name: string): Error => {
  error.name = name
  return error
}

const reasonPayloadOf = (reason: object): Opaque => fieldOf(reason, 'error') ?? fieldOf(reason, 'defect')

const firstReasonOf = (cause: Cause.Cause<Opaque>): Opaque => {
  const reason = cause.reasons[0]
  if (reason === undefined) return cause
  return reasonPayloadOf(reason)
}

const payloadOf = (failure: Opaque): Opaque => Cause.isCause(failure) ? firstReasonOf(failure) : failure

const causeOf = (value: Opaque): object | undefined =>
  isObject(value) ? objectOrUndefined(fieldOf(value, 'cause')) : undefined

const chainedCausesOf = (value: Opaque, depth: number): ReadonlyArray<Opaque> => {
  const cause = causeOf(value)
  return cause === undefined ? [] : causeChainOf(cause, depth - 1)
}

const causeChainOf = (value: Opaque, depth: number): ReadonlyArray<Opaque> => {
  if (depth <= 0) return []
  return [value, ...chainedCausesOf(value, depth)]
}

const layerChainOf = (failure: Opaque): ReadonlyArray<Opaque> => {
  const first = payloadOf(failure)
  return [first, ...chainedCausesOf(first, CAUSE_DEPTH)]
}

const diffCarrierOf = (failure: Opaque): object | undefined =>
  layerChainOf(failure).map(objectOrUndefined).filter(isObject).find(isDiffLayer)

const copyField = (error: Error, carrier: object, field: string): void => {
  const value = fieldOf(carrier, field)
  if (value === undefined) return
  Object.defineProperty(error, field, { value, enumerable: true, configurable: true, writable: true })
}

const copyFields = (error: Error, carrier: object): Error => {
  for (const field of DIFF_FIELDS) copyField(error, carrier, field)
  return error
}

const copyDiffFields = (error: Error, failure: Opaque): Error => {
  const carrier = diffCarrierOf(failure)
  return carrier === undefined ? error : copyFields(error, carrier)
}

/** @internal */
export const failureRecordError = (record: FailureRecord): Error => {
  const message = withoutTag(record)
  return marked(withStack(withName(new Error(message), record.name), record, message))
}

/** Whether a value is the Error one rendered record threw, which a second throw site passes through unchanged.
 *
 * @internal
 */
export const isFailureRecordError = (value: Opaque): value is Error =>
  isObject(value) && fieldOf(value, RECORD) === true

/**
 * Renders the record and throws the Error Vitest prints for it, carrying the failure's diff fields when it has any.
 *
 * @internal
 */
export const throwFailureRecord = <E>(input: FailureRecordInput<E>): never => {
  const error = failureRecordError(renderFailureRecord(input))
  throw copyDiffFields(error, input.failure)
}

/**
 * The one renderer for a spec failure: the failure and the spans its run recorded become the record Vitest
 * prints, together with the contract rules that record breaks (KTD1, KTD7).
 *
 * The record is ordered by R2-R6: the raising frame leads, the failing step and its spec line follow, then every
 * cause layer, then the step trail with the cell decisions each step caused, then the rerun command. The
 * renderer is pure and never throws: a value it cannot read renders as text, never as an exception.
 *
 * @since 4.0.0
 */
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Tracer from 'effect/Tracer'
import { TestRunner } from 'vitest'
import { replayOfParts, replayTextOf } from '../replay.schema.js'
import { framesOf as stackFramesOf, isUserFrame, siteOfFrame, type StackFrame } from './call-site.js'
import { type Breach, FailureRecordRefused } from './errors.schema.js'
import type { Witness } from './property/error.schema.js'
import { providedPackage } from './provided.js'

/** A value the renderer narrows rather than assumes. */
type Opaque<A = unknown> = A

/**
 * A value a recorded span attribute or a replay path carries. Structured values stay structured on the span
 * (KTD2); the renderer decides the text.
 *
 * @internal
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<AttributeValue>
  | { readonly [key: string]: AttributeValue }

/** A replay path entry that is not text. */
type EntryNoText = Exclude<AttributeValue, string>

/** A replay path entry that is neither text nor null. */
type EntryNoNull = Exclude<EntryNoText, null>

/** A replay path entry that is neither text, null nor a primitive: a list or a record. */
type EntryStructure = Exclude<EntryNoNull, number | boolean | bigint>

/**
 * The test a failure happened in, as Vitest knows it. `file` is the path the rerun command names, so a caller
 * that holds an absolute path derives the repo-relative one before handing it over.
 *
 * @internal
 */
export interface TestIdentity {
  /**
   * The npm package the test file belongs to, e.g. `@systemfsoftware/effect-readiness`. Empty when the run
   * provided no name: the rerun command then drops its `pnpm --filter` prefix and runs from the package
   * directory, which is not a breach (R6).
   */
  readonly package: string
  /** The test file, as the rerun command writes it. */
  readonly file: string
  /** The scenario name the rerun command filters on with `-t`. */
  readonly name: string
}

/**
 * The value a generator chose a run by: the kernel's seed and decision path, or a property counterexample's
 * seed and path. A path without a seed is a replay value offered for a baseline run, which R6 refuses (KTD5).
 *
 * @internal
 */
export interface ReplayValue {
  /** The generator's seed, or `undefined` when only a path was recorded. */
  readonly seed: number | undefined
  /** The decisions the generator chose, in order; a decision is the index the scheduler picked (KTD5). */
  readonly path: ReadonlyArray<number>
}

/**
 * A contract rule a rendered record breaks; the runner refuses such a record (R10, KTD7).
 *
 * @internal
 */
/**
 * What a rendered failure gives Vitest: the tag the error carries, the record text, and the rules it breaks.
 *
 * @internal
 */
export interface FailureRecord {
  /** The headline's failure tag, e.g. `StepError`; the runner sets it as the thrown error's `name`. */
  readonly name: string
  /** The text Vitest prints as the failure's message. */
  readonly record: string
  /** The contract rules the record breaks: `R1` empty headline, `R2` no location, `R6` replay or rerun. */
  readonly breaches: ReadonlyArray<Breach>
  /**
   * The raised failure itself when it is one of the property-channel variants, so an in-process corpus run reads
   * its fields without parsing the record text (R1, R2). Absent for every other failure.
   */
  readonly failure?: Opaque
}

/**
 * Everything one failure is rendered from: the failure, its run's spans, the test and the replay value.
 *
 * @internal
 */
export interface FailureRecordInput<E = never> {
  /** The failure itself: a `Cause`, or the value a program threw or failed with. */
  readonly failure: Cause.Cause<E> | E
  /** Every span the failing run recorded, in creation order. */
  readonly spans: ReadonlyArray<Tracer.NativeSpan>
  /** The test the run belonged to. */
  readonly identity: TestIdentity
  /** The generator that chose this run, or `undefined` on a run no generator chose. */
  readonly replay: ReplayValue | undefined
  /**
   * The seed the kernel's scheduler chose. The kernel knows its own scheduler, so it hands the note over rather
   * than the renderer guessing it; a run no scheduler chose renders no note (KTD5).
   */
  readonly schedule?: { readonly seed: number } | undefined
  /**
   * The workspace root the rendered paths are relativized against, provided by the shared config the same way the
   * package name is. Omitted, paths print absolute.
   */
  readonly root?: string | undefined
}

const STEP_SPAN = 'gherkin.step'
const STEP_KEYWORD = 'gherkin.keyword'
const STEP_TEXT = 'gherkin.text'
const CODE_SITE = 'code.site'
const CELL_NAME = 'cell.name'
const CELL_STACKTRACE = 'cell.stacktrace'
const CELL_DECIDE_STACKTRACE = 'cell.decide_stacktrace'
const CELL_COMMAND_TAG = 'cell.command_tag'
const CELL_MEMBER_TAGS = 'cell.member_tags'
const CELL_DECLARED = 'cell.declared'
const CELL_OUTCOME = 'cell.outcome'
const TAG_FIELD = '_tag'
const MESSAGE_FIELD = 'message'
const NAME_FIELD = 'name'
const STACK_FIELD = 'stack'
const CAUSE_FIELD = 'cause'
const FILE_PROTOCOL = 'file://'
const UNKNOWN_SITE = '?'
const DEFAULT_FAILURE_NAME = 'Error'
const NEVER_FINISHED = '   (never finished)'
const CAUSE_DEPTH = 6

/** The fields a layer's own values exclude: the chain renders the cause, and the raise site names the stack. */
const SKIPPED_FIELDS: Record<string, true> = {
  [TAG_FIELD]: true,
  [MESSAGE_FIELD]: true,
  [NAME_FIELD]: true,
  [STACK_FIELD]: true,
  [CAUSE_FIELD]: true,
}

/** The contract's "first location": any `<path>:<line>` the record names. */
const LOCATION = /(?:[\w.@-]+\/)*[\w.@-]+\.[cm]?[jt]sx?:\d+/u

const COLUMN_SUFFIX = /:\d+$/u

const MARK: Record<string, string> = { passed: '✓', failed: '✗', unfinished: '✗' }

const not = (value: boolean): boolean => !value
const and = (left: boolean, right: boolean): boolean => left && right
const or = (left: boolean, right: boolean): boolean => left || right

const firstPresent = (values: ReadonlyArray<string | undefined>): string | undefined =>
  values.find((value) => value !== undefined)

const isObject = (value: Opaque): value is object => typeof value === 'object' && value !== null
const isText = (value: Opaque): value is string => typeof value === 'string'
const isArray = (value: Opaque): value is ReadonlyArray<Opaque> => Array.isArray(value)
const isNumber = (value: Opaque): value is number => typeof value === 'number'
const isBoolean = (value: Opaque): value is boolean => typeof value === 'boolean'
const isBigInt = (value: Opaque): value is bigint => typeof value === 'bigint'
const isNull = (value: Opaque): value is null => value === null
const isPrimitive = (value: Opaque): value is number | boolean | bigint =>
  or(or(isNumber(value), isBoolean(value)), isBigInt(value))
const objectOrUndefined = (value: Opaque): object | undefined => isObject(value) ? value : undefined
const isFieldName = (name: string): boolean => SKIPPED_FIELDS[name] !== true

const presentOrUndefined = (text: string): string | undefined => text.length === 0 ? undefined : text

const nonEmptyText = (text: string | undefined): string | undefined =>
  text === undefined ? undefined : presentOrUndefined(text)

const fieldOf = (value: object, key: string | symbol): Opaque => Reflect.get(value, key)

const textFieldOf = (value: object, key: string): string | undefined => {
  const field = fieldOf(value, key)
  return isText(field) ? field : undefined
}

const nonEmptyFieldOf = (value: object, key: string): string | undefined => nonEmptyText(textFieldOf(value, key))

const tagFieldOf = (value: object): string | undefined => nonEmptyFieldOf(value, TAG_FIELD)

const messageFieldOf = (value: object): string | undefined => nonEmptyFieldOf(value, MESSAGE_FIELD)

interface Pair {
  readonly name: string
  readonly text: string
}

const pairOf = (name: string, text: string): Pair => ({ name, text })

const pairTextOf = (pair: Pair): string => `${JSON.stringify(pair.name)}:${pair.text}`

const pairTextsOf = (pairs: ReadonlyArray<Pair>): ReadonlyArray<string> => pairs.map(pairTextOf)

const hasPair = (pairs: ReadonlyArray<Pair>, name: string): boolean => pairs.some((pair) => pair.name === name)

const pairsOf = (value: Opaque): ReadonlyArray<Pair> =>
  isObject(value) ? Object.keys(value).map((key) => pairOf(key, renderValue(fieldOf(value, key)))) : []

const fieldsOf = (value: object): ReadonlyArray<Pair> => pairsOf(value).filter((pair) => isFieldName(pair.name))

const renderValue = (value: Opaque): string => witnessOf(value).rendered

const renderScalar = (value: Opaque): string => isText(value) ? JSON.stringify(value) : renderPrimitive(value)

const renderPrimitive = (value: Opaque): string => isBigInt(value) ? `${value}n` : renderPlain(value)

const renderPlain = (value: Opaque): string => isPrimitive(value) ? `${value}` : renderOther(value)

const renderOther = (value: Opaque): string => isNull(value) ? 'null' : renderUndefined(value)

const renderUndefined = (value: Opaque): string => value === undefined ? 'undefined' : renderContainer(value)

const renderContainer = (value: Opaque): string => isArray(value) ? renderList(value) : typeof value

const listTextOf = (children: ReadonlyArray<string>): string => `[${children.join(',')}]`

const recordTextOf = (pairs: ReadonlyArray<Pair>): string => `{${pairTextsOf(pairs).join(',')}}`

const renderList = (value: ReadonlyArray<Opaque>): string => listTextOf(value.map(renderValue))

const renderRecord = (value: object): string => recordTextOf(pairsOf(value))

/**
 * A value `JSON.stringify` carries: the projection a witness travels to a consumer as (R3, KD7).
 *
 * @internal
 */
export type JsonValue = Schema.Json

/** @internal */
export type { Witness }

/** A record field whose value is a rendered witness rather than text. */
interface WitnessEntry {
  readonly name: string
  readonly witness: Witness
}

const KIND_FIELD = '_kind'
const VALUE_FIELD = 'value'
const DESCRIPTION_FIELD = 'description'
const UNDEFINED_JSON: JsonValue = { [KIND_FIELD]: 'undefined' }
const CIRCULAR_JSON: JsonValue = { [KIND_FIELD]: 'circular' }
const CIRCULAR_WITNESS: Witness = { rendered: '[Circular]', value: CIRCULAR_JSON }

const markOf = (kind: string, field: string, text: string): JsonValue => ({ [KIND_FIELD]: kind, [field]: text })

const isSymbol = (value: Opaque): value is symbol => typeof value === 'symbol'

/** A function a witness marks by name: only `typeof` and its `name` are read from it. */
type Callable = (...args: ReadonlyArray<never>) => void

const isCallable = (value: Opaque): value is Callable => typeof value === 'function'

const callableNameOf = (value: Callable): string => {
  const name = fieldOf(value, NAME_FIELD)
  return isText(name) ? name : ''
}

const numberJsonOf = (value: number): JsonValue =>
  Number.isFinite(value) ? value : markOf('number', VALUE_FIELD, `${value}`)

const bigintJsonOf = (value: bigint): JsonValue => markOf('bigint', VALUE_FIELD, `${value}`)

const functionJsonOf = (value: Callable): JsonValue => markOf('function', NAME_FIELD, callableNameOf(value))

const symbolJsonOf = (value: symbol): JsonValue => markOf('symbol', DESCRIPTION_FIELD, value.description ?? '')

const scalarJsonOf = (value: Opaque): JsonValue => isText(value) ? value : nonTextJsonOf(value)

const nonTextJsonOf = (value: Opaque): JsonValue => isBoolean(value) ? value : nullOrOtherJsonOf(value)

const nullOrOtherJsonOf = (value: Opaque): JsonValue => isNull(value) ? value : numberOrOtherJsonOf(value)

const numberOrOtherJsonOf = (value: Opaque): JsonValue =>
  isNumber(value) ? numberJsonOf(value) : bigintOrOtherJsonOf(value)

const bigintOrOtherJsonOf = (value: Opaque): JsonValue =>
  isBigInt(value) ? bigintJsonOf(value) : callableOrUndefinedJsonOf(value)

const callableOrUndefinedJsonOf = (value: Opaque): JsonValue =>
  isCallable(value) ? functionJsonOf(value) : symbolOrUndefinedJsonOf(value)

const symbolOrUndefinedJsonOf = (value: Opaque): JsonValue => isSymbol(value) ? symbolJsonOf(value) : UNDEFINED_JSON

/**
 * The one traversal a value's rendered text and its JSON projection come from (R3, KD7): `rendered` is exactly
 * `renderValue`'s text, `value` is the same walk with every value JSON cannot carry marked by kind, and a cycle
 * marks `circular` rather than recursing forever.
 *
 * @internal
 */
export const witnessOf = (value: Opaque): Witness => witnessAt(value, [])

const witnessAt = (value: Opaque, seen: ReadonlyArray<object>): Witness =>
  isObject(value) ? witnessedStructure(value, seen) : witnessedScalar(value)

const witnessedStructure = (value: object, seen: ReadonlyArray<object>): Witness =>
  seen.includes(value) ? CIRCULAR_WITNESS : witnessedObject(value, seen)

const witnessedObject = (value: object, seen: ReadonlyArray<object>): Witness =>
  isArray(value) ? witnessedList(value, seen) : witnessedRecord(value, seen)

const witnessedScalar = (value: Opaque): Witness => ({ rendered: renderScalar(value), value: scalarJsonOf(value) })

const witnessedList = (value: ReadonlyArray<Opaque>, seen: ReadonlyArray<object>): Witness => {
  const children = value.map((item) => witnessAt(item, seenWith(seen, value)))
  return { rendered: listTextOf(children.map(renderedOf)), value: children.map(witnessValueOf) }
}

const witnessedRecord = (value: object, seen: ReadonlyArray<object>): Witness => {
  const entries = entriesAt(value, seenWith(seen, value))
  return {
    rendered: tagFieldOf(value) ?? recordTextOf(entryPairsOf(entries)),
    value: entriesJsonOf(entries),
  }
}

const seenWith = (seen: ReadonlyArray<object>, value: object): ReadonlyArray<object> => [...seen, value]

const entriesAt = (value: object, seen: ReadonlyArray<object>): ReadonlyArray<WitnessEntry> =>
  Object.keys(value).map((key) => witnessEntryOf(key, witnessAt(fieldOf(value, key), seen)))

const witnessEntryOf = (name: string, witness: Witness): WitnessEntry => ({ name, witness })

const entryPairsOf = (entries: ReadonlyArray<WitnessEntry>): ReadonlyArray<Pair> =>
  entries.map((entry) => pairOf(entry.name, entry.witness.rendered))

const entriesJsonOf = (entries: ReadonlyArray<WitnessEntry>): JsonValue =>
  Object.fromEntries(entries.map((entry): readonly [string, JsonValue] => [entry.name, entry.witness.value]))

const renderedOf = (witness: Witness): string => witness.rendered

const witnessValueOf = (witness: Witness): JsonValue => witness.value

const bracesOf = (pairs: ReadonlyArray<Pair>): string => ` {${pairTextsOf(pairs).join(',')}}`

const renderFields = (value: object): string => bracesOf(fieldsOf(value))

const textSummaryOf = (text: string): string => text.length === 0 ? text : JSON.stringify(text)

const scalarSummaryOf = (value: Opaque): string => isText(value) ? textSummaryOf(value) : renderScalar(value)

/** @internal */
export const summaryOf = (value: Opaque): string => isObject(value) ? objectSummaryOf(value) : scalarSummaryOf(value)

const objectSummaryOf = (value: object): string => {
  const tag = tagFieldOf(value)
  return tag === undefined ? untaggedSummaryOf(value) : taggedSummaryOf(tag, value)
}

const untaggedSummaryOf = (value: object): string =>
  isErrorValue(value) ? errorSummaryOf(value) : valueRecordSummaryOf(value)

const valueRecordSummaryOf = (value: object): string => isArray(value) ? renderList(value) : renderRecord(value)

const isErrorValue = (value: Opaque): value is Error => value instanceof Error

const firstLine = (text: string): string => text.split('\n')[0] ?? text

const restLines = (text: string): ReadonlyArray<string> => text.split('\n').slice(1)

const taggedSummaryOf = (tag: string, value: object): string => {
  const message = messageFieldOf(value)
  return message === undefined ? `${tag}${renderFields(value)}` : `${tag}: ${firstLine(message)}`
}

const errorSummaryOf = (value: object): string => {
  const name = objectNameOf(value)
  const message = messageFieldOf(value)
  return message === undefined ? `${name}${renderFields(value)}` : `${name}: ${firstLine(message)}`
}

const objectNameOf = (value: object): string =>
  firstPresent([tagFieldOf(value), nonEmptyFieldOf(value, NAME_FIELD)]) ?? DEFAULT_FAILURE_NAME

const headlineOf = (layers: ReadonlyArray<Opaque>): string => layers.length === 0 ? '' : summaryOf(layers[0])

const nameOf = (layers: ReadonlyArray<Opaque>): string => {
  const entry = layers[0]
  return isObject(entry) ? objectNameOf(entry) : DEFAULT_FAILURE_NAME
}

const stripProtocol = (path: string): string => path.startsWith(FILE_PROTOCOL) ? path.slice(FILE_PROTOCOL.length) : path

const stripColumn = (site: string): string => site.replace(COLUMN_SUFFIX, '')

const knownSiteOf = (site: Opaque): string | undefined => isText(site) ? stripColumn(stripProtocol(site)) : undefined

const siteTextOf = (site: Opaque): string => knownSiteOf(site) ?? UNKNOWN_SITE

const siteOfFrames = (frames: ReadonlyArray<StackFrame>): string | undefined =>
  Option.getOrUndefined(Option.map(Option.fromUndefinedOr(frames.find(isUserFrame)), siteOfFrame))

/** The author's site in a raw captured stack, the form a cell span records instead of a pre-resolved site. */
const cellStackSiteOf = (stack: Opaque): string | undefined =>
  isText(stack) ? siteOfFrames(stackFramesOf(stack)) : undefined

const stackSiteTextOf = (stack: Opaque): string => knownSiteOf(cellStackSiteOf(stack)) ?? UNKNOWN_SITE

const stackIn = (value: object): string => textFieldOf(value, STACK_FIELD) ?? ''

const stackOf = (value: Opaque): string => isObject(value) ? stackIn(value) : ''

const framesOf = (value: Opaque): ReadonlyArray<StackFrame> => stackFramesOf(stackOf(value))

const isFrame = (frame: StackFrame | undefined): frame is StackFrame => frame !== undefined

const usableFrameOf = (value: Opaque): StackFrame | undefined => framesOf(value).find(isUserFrame)

const frameTextOf = (frame: StackFrame): string => `${frame.path}:${frame.line}${frameNameSuffix(frame.fn)}`

const isAuthorName = (fn: string | undefined): fn is string => fn !== undefined && !fn.includes('~effect/')

const frameNameSuffix = (fn: string | undefined): string => isAuthorName(fn) ? ` (${fn})` : ''

const isSameSite = (frame: StackFrame, other: StackFrame): boolean =>
  and(frame.path === other.path, frame.line === other.line)

const isSameFrame = (frame: StackFrame, other: StackFrame | undefined): boolean =>
  other === undefined ? false : isSameSite(frame, other)

const chosenFrameOf = (layers: ReadonlyArray<Opaque>): StackFrame | undefined => {
  const inner = layers.slice(1).map(usableFrameOf).filter(isFrame).at(-1)
  return inner === undefined ? usableFrameOf(layers[0]) : inner
}

const attrOf = (span: Tracer.NativeSpan, key: string): Opaque => span.attributes.get(key)

const textAttrOf = (span: Tracer.NativeSpan, key: string): string | undefined => {
  const value = attrOf(span, key)
  return isText(value) ? value : undefined
}

const ancestorsIn = (span: Tracer.AnySpan): ReadonlyArray<Tracer.NativeSpan> =>
  span instanceof Tracer.NativeSpan ? [span, ...ancestorsOf(span.parent)] : []

const ancestorsOf = (parent: Option.Option<Tracer.AnySpan>): ReadonlyArray<Tracer.NativeSpan> =>
  Option.isNone(parent) ? [] : ancestorsIn(parent.value)

const stepAncestorOf = (span: Tracer.NativeSpan): Tracer.NativeSpan | undefined =>
  ancestorsOf(span.parent).find((ancestor) => ancestor.name === STEP_SPAN)

type StepState = 'passed' | 'failed' | 'unfinished'

const stateOf = (span: Tracer.NativeSpan): StepState =>
  Match.value(span.status).pipe(
    Match.when({ _tag: 'Started' }, (): StepState => 'unfinished'),
    Match.when({ _tag: 'Ended' }, (ended) => endedStateOf(ended.exit)),
    Match.exhaustive,
  )

const endedStateOf = (exit: Exit.Exit<Opaque, Opaque>): StepState => Exit.isSuccess(exit) ? 'passed' : 'failed'

const stepSpansOf = (spans: ReadonlyArray<Tracer.NativeSpan>): ReadonlyArray<Tracer.NativeSpan> =>
  spans.filter(isTopStepSpan)

const isTopStepSpan = (span: Tracer.NativeSpan): boolean =>
  and(span.name === STEP_SPAN, stepAncestorOf(span) === undefined)

const isCellSpan = (span: Tracer.NativeSpan): boolean => isText(attrOf(span, CELL_STACKTRACE))

const cellSpansOf = (spans: ReadonlyArray<Tracer.NativeSpan>): ReadonlyArray<Tracer.NativeSpan> =>
  spans.filter(isCellSpan)

const cellNameOf = (cell: Tracer.NativeSpan): string => textAttrOf(cell, CELL_NAME) ?? cell.name

const causeFieldOf = (value: Opaque): object | undefined =>
  isObject(value) ? objectOrUndefined(fieldOf(value, CAUSE_FIELD)) : undefined

/** One layer with whatever its own `cause` adds, depth-limited. */
const layerWithCauseOf = (
  value: Opaque,
  depth: number,
): ReadonlyArray<Opaque> => [value, ...nestedCauseOf(value, depth - 1)]

/** The layers the reasons of an Effect `Cause` add, each rendered as any other layer. */
const reasonLayersOf = (cause: Cause.Cause<Opaque>, depth: number): ReadonlyArray<Opaque> =>
  cause.reasons.flatMap((reason) => layerWithCauseOf(reasonPayloadOf(reason), depth))

const layersOfCause = (cause: object, depth: number): ReadonlyArray<Opaque> =>
  Cause.isCause(cause) ? reasonLayersOf(cause, depth) : layerWithCauseOf(cause, depth)

const nestedOf = (cause: object | undefined, depth: number): ReadonlyArray<Opaque> =>
  cause === undefined ? [] : layersOfCause(cause, depth)

const nestedCauseOf = (value: Opaque, depth: number): ReadonlyArray<Opaque> =>
  depth === 0 ? [] : nestedOf(causeFieldOf(value), depth)

const causeChainOf = (value: Opaque): ReadonlyArray<Opaque> => [value, ...nestedCauseOf(value, CAUSE_DEPTH)]

const interruptTextOf = (reason: Cause.Interrupt): string =>
  reason.fiberId === undefined ? 'interrupted' : `interrupted by fiber #${reason.fiberId}`

const reasonPayloadOf = (reason: Cause.Reason<Opaque>): Opaque =>
  Match.value(reason).pipe(
    Match.when({ _tag: 'Fail' }, (fail) => fail.error),
    Match.when({ _tag: 'Die' }, (die) => die.defect),
    Match.when({ _tag: 'Interrupt' }, (interrupt) => interruptTextOf(interrupt)),
    Match.exhaustive,
  )

const reasonsOf = (cause: Cause.Cause<Opaque>): ReadonlyArray<Opaque> =>
  cause.reasons.flatMap((reason) => causeChainOf(reasonPayloadOf(reason)))

const layersOf = (failure: Opaque): ReadonlyArray<Opaque> =>
  Cause.isCause(failure) ? reasonsOf(failure) : causeChainOf(failure)

const declineOf = (span: Tracer.NativeSpan): string => stateOf(span) === 'unfinished' ? NEVER_FINISHED : ''

const capitalize = (text: string): string =>
  text.length === 0 ? text : `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`

const keywordOf = (step: Tracer.NativeSpan): string => capitalize(textAttrOf(step, STEP_KEYWORD) ?? '')

const stepTextOf = (step: Tracer.NativeSpan): string => textAttrOf(step, STEP_TEXT) ?? ''

const stepSiteOf = (step: Tracer.NativeSpan): string => siteTextOf(attrOf(step, CODE_SITE))

const stepLineOf = (step: Tracer.NativeSpan): string =>
  `  ${MARK[stateOf(step)]} ${keywordOf(step)} ${stepTextOf(step)}   ${stepSiteOf(step)}${declineOf(step)}`

const commandOf = (cell: Tracer.NativeSpan): string => textAttrOf(cell, CELL_COMMAND_TAG) ?? ''

const cellPairsOf = (cell: Tracer.NativeSpan): ReadonlyArray<Pair> => {
  const members = pairsOf(attrOf(cell, CELL_MEMBER_TAGS))
  const declared = pairsOf(attrOf(cell, CELL_DECLARED)).filter((pair) => !hasPair(members, pair.name))
  return [...members, ...declared]
}

const pairsBracesOf = (cell: Tracer.NativeSpan): string => bracesOf(cellPairsOf(cell))

const outcomeOf = (cell: Tracer.NativeSpan): string => {
  const outcome = textAttrOf(cell, CELL_OUTCOME)
  return outcome === undefined ? '' : ` → ${outcome}`
}

interface DecisionBlock {
  readonly head: string
  readonly tail: string
}

const blockOf = (cell: Tracer.NativeSpan): DecisionBlock => ({
  head: `      cell ${cellNameOf(cell)}: ${commandOf(cell)}${pairsBracesOf(cell)}${outcomeOf(cell)}`,
  tail: `        decide ${stackSiteTextOf(attrOf(cell, CELL_DECIDE_STACKTRACE))}   ` +
    `cell ${stackSiteTextOf(attrOf(cell, CELL_STACKTRACE))}`,
})

interface DecisionGroup {
  readonly block: DecisionBlock
  readonly count: number
}

const groupOf = (block: DecisionBlock, count: number): DecisionGroup => ({ block, count })

const isSameBlock = (block: DecisionBlock, other: DecisionBlock): boolean =>
  and(block.head === other.head, block.tail === other.tail)

const appendBeside = (
  groups: ReadonlyArray<DecisionGroup>,
  block: DecisionBlock,
  last: DecisionGroup,
): ReadonlyArray<DecisionGroup> =>
  isSameBlock(last.block, block)
    ? [...groups.slice(0, -1), groupOf(block, last.count + 1)]
    : [...groups, groupOf(block, 1)]

const appendAfter = (
  groups: ReadonlyArray<DecisionGroup>,
  block: DecisionBlock,
  last: DecisionGroup | undefined,
): ReadonlyArray<DecisionGroup> => last === undefined ? [groupOf(block, 1)] : appendBeside(groups, block, last)

const appendGroup = (groups: ReadonlyArray<DecisionGroup>, block: DecisionBlock): ReadonlyArray<DecisionGroup> =>
  appendAfter(groups, block, groups.at(-1))

const groupsOf = (blocks: ReadonlyArray<DecisionBlock>): ReadonlyArray<DecisionGroup> =>
  blocks.reduce<ReadonlyArray<DecisionGroup>>(appendGroup, [])

const groupLinesOf = (group: DecisionGroup): ReadonlyArray<string> => [
  group.count > 1 ? `${group.block.head}  (×${group.count})` : group.block.head,
  group.block.tail,
]

const cellsUnder = (
  spans: ReadonlyArray<Tracer.NativeSpan>,
  step: Tracer.NativeSpan,
): ReadonlyArray<Tracer.NativeSpan> => cellSpansOf(spans).filter((cell) => stepAncestorOf(cell) === step)

const decisionLinesOf = (spans: ReadonlyArray<Tracer.NativeSpan>, step: Tracer.NativeSpan): ReadonlyArray<string> =>
  groupsOf(cellsUnder(spans, step).map(blockOf)).flatMap(groupLinesOf)

const trailStepsOf = (spans: ReadonlyArray<Tracer.NativeSpan>): ReadonlyArray<Tracer.NativeSpan> => {
  const steps = stepSpansOf(spans)
  const failing = steps.find((step) => stateOf(step) !== 'passed')
  return failing === undefined ? steps : steps.slice(0, steps.indexOf(failing) + 1)
}

const trailLinesOf = (spans: ReadonlyArray<Tracer.NativeSpan>): ReadonlyArray<string> =>
  trailStepsOf(spans).flatMap((step) => [stepLineOf(step), ...decisionLinesOf(spans, step)])

const layerHintOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string => {
  const cell = cellSpansOf(spans).at(0)
  return cell === undefined ? '' : ` (cell ${cellNameOf(cell)})`
}

const failingStepTextOf = (step: Tracer.NativeSpan): string =>
  `Failing step: ${keywordOf(step)} ${stepTextOf(step)}   ${stepSiteOf(step)}`

const noFailingStepLineOf = (
  steps: ReadonlyArray<Tracer.NativeSpan>,
  spans: ReadonlyArray<Tracer.NativeSpan>,
): string =>
  steps.length === 0
    ? `Failing step: no step ran${layerHintOf(spans)}`
    : 'Failing step: none of the steps failed'

const failingStepLineOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string => {
  const steps = stepSpansOf(spans)
  const failing = steps.find((step) => stateOf(step) !== 'passed')
  return failing === undefined ? noFailingStepLineOf(steps, spans) : failingStepTextOf(failing)
}

const isFailedSpan = (span: Tracer.NativeSpan): boolean => stateOf(span) === 'failed'

const isUnfinishedCell = (span: Tracer.NativeSpan): boolean => and(isCellSpan(span), stateOf(span) === 'unfinished')

const spanSiteOf = (span: Tracer.NativeSpan): string | undefined =>
  knownSiteOf(attrOf(span, CODE_SITE)) ?? knownSiteOf(cellStackSiteOf(attrOf(span, CELL_STACKTRACE)))

const cellSiteOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined => {
  const cell = spans.toReversed().find(isCellSpan)
  return cell === undefined ? undefined : spanSiteOf(cell)
}

const unfinishedDecideSiteOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined => {
  const unfinished = spans.toReversed().find(isUnfinishedCell)
  return unfinished === undefined
    ? undefined
    : knownSiteOf(cellStackSiteOf(attrOf(unfinished, CELL_DECIDE_STACKTRACE)))
}

const decideSiteOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined =>
  unfinishedDecideSiteOf(spans) ?? cellSiteOf(spans)

const failedSiteOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined => {
  const failed = spans.toReversed().find(isFailedSpan)
  return failed === undefined ? undefined : spanSiteOf(failed)
}

const fallbackSiteOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined =>
  failedSiteOf(spans) ?? decideSiteOf(spans)

const fallbackRaisedAtLineOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined => {
  const site = fallbackSiteOf(spans)
  return site === undefined ? undefined : `  raised at ${site}`
}

const raisedAtLineOf = (frame: StackFrame | undefined, spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined =>
  frame === undefined ? fallbackRaisedAtLineOf(spans) : `  raised at ${frameTextOf(frame)}`

const chainNamedFrame = (frame: StackFrame, chosen: StackFrame | undefined): string =>
  isSameFrame(frame, chosen) ? '' : `   raised at ${frameTextOf(frame)}`

const chainFrameTextOf = (frame: StackFrame | undefined, chosen: StackFrame | undefined): string =>
  frame === undefined ? '' : chainNamedFrame(frame, chosen)

const chainLineOf = (layer: Opaque, chosen: StackFrame | undefined): string =>
  `  ${summaryOf(layer)}${chainFrameTextOf(usableFrameOf(layer), chosen)}`

const chainContinuation = (line: string): string => `    ${line}`

const isMessageBearing = (layer: object): boolean => or(tagFieldOf(layer) !== undefined, isErrorValue(layer))

const messageOf = (layer: object): string => messageFieldOf(layer) ?? ''

const messageTailLines = (layer: object): ReadonlyArray<string> =>
  isMessageBearing(layer) ? restLines(messageOf(layer)).map(chainContinuation) : []

const chainDetailLines = (layer: Opaque): ReadonlyArray<string> => isObject(layer) ? messageTailLines(layer) : []

const chainLayerLines = (layer: Opaque, chosen: StackFrame | undefined): ReadonlyArray<string> => [
  chainLineOf(layer, chosen),
  ...chainDetailLines(layer),
]

const chainLinesOf = (layers: ReadonlyArray<Opaque>, chosen: StackFrame | undefined): ReadonlyArray<string> =>
  layers.slice(1).flatMap((layer) => chainLayerLines(layer, chosen))

const quoted = (text: string): string => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

const renderEntryNonNull = (value: EntryNoText): string => isNull(value) ? 'null' : renderEntryValue(value)

const renderEntryValue = (value: EntryNoNull): string => isPrimitive(value) ? `${value}` : renderEntryStructure(value)

const renderEntryStructure = (value: EntryStructure): string =>
  isArray(value) ? renderEntryList(value) : renderEntryRecord(value)

const renderEntryList = (value: ReadonlyArray<AttributeValue>): string => `[${value.map(renderEntry).join(';')}]`

const renderEntryRecord = (value: { readonly [key: string]: AttributeValue }): string =>
  `{${Object.entries(value).map(([key, entry]) => `${key}: ${renderEntry(entry)}`).join(';')}}`

const renderEntry = (value: AttributeValue): string => isText(value) ? quoted(value) : renderEntryNonNull(value)

const REPLAY_FIELD = 'replay'

const propertyReplayTextOf = (failure: Opaque): string | undefined => {
  const layer = propertyFailureOf(failure)
  return layer === undefined ? undefined : textFieldOf(layer, REPLAY_FIELD)
}

const rerunReplayTextOf = (replay: ReplayValue): string | undefined =>
  Option.getOrUndefined(
    Option.flatMap(
      Option.fromUndefinedOr(replay.seed),
      (seed) => Option.map(replayOfParts({ seed, path: replay.path }), replayTextOf),
    ),
  )

const kernelReplayTextOf = (replay: ReplayValue | undefined): string | undefined =>
  replay === undefined ? undefined : rerunReplayTextOf(replay)

const replayPrefixText = (text: string | undefined): string => text === undefined ? '' : `CONFORMANCE_REPLAY="${text}" `

const replayPrefixOf = (replayText: string | undefined, replay: ReplayValue | undefined): string =>
  replayPrefixText(replayText ?? kernelReplayTextOf(replay))

const isCompleteIdentity = (identity: TestIdentity): boolean => and(identity.file.length > 0, identity.name.length > 0)

const filterPrefixOf = (identity: TestIdentity): string =>
  identity.package.length === 0 ? '' : `pnpm --filter ${identity.package} exec `

const rerunLineOf = (
  identity: TestIdentity,
  replay: ReplayValue | undefined,
  replayText: string | undefined,
): string | undefined =>
  isCompleteIdentity(identity)
    ? `  ${replayPrefixOf(replayText, replay)}${filterPrefixOf(identity)}vitest run ${identity.file} -t ` +
      quoted(identity.name)
    : undefined

const rerunLinesOf = (
  identity: TestIdentity,
  replay: ReplayValue | undefined,
  replayText: string | undefined,
): ReadonlyArray<string> => {
  const line = rerunLineOf(identity, replay, replayText)
  return line === undefined ? [] : ['Rerun only this scenario:', line]
}

const baselineReplay = (replay: ReplayValue): boolean => and(replay.seed === undefined, replay.path.length > 0)

const replayOnBaseline = (replay: ReplayValue | undefined): boolean =>
  replay === undefined ? false : baselineReplay(replay)

interface RecordParts {
  readonly headline: string
  readonly raisedAt: string | undefined
  readonly failingStep: string
  readonly detail: ReadonlyArray<string>
  readonly chain: ReadonlyArray<string>
  readonly trail: ReadonlyArray<string>
  readonly schedule: ReadonlyArray<string>
  readonly rerun: ReadonlyArray<string>
}

const headMessageOf = (layers: ReadonlyArray<Opaque>): string | undefined => {
  const entry = layers[0]
  return isObject(entry) ? messageFieldOf(entry) : undefined
}

const detailOf = (layers: ReadonlyArray<Opaque>): ReadonlyArray<string> => {
  const message = headMessageOf(layers)
  return message === undefined ? [] : restLines(message)
}

const detailLinesOf = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines.length === 0 ? [] : [...lines.map((line) => `  ${line}`), '']

const scheduleLinesOf = (schedule: { readonly seed: number } | undefined): ReadonlyArray<string> =>
  schedule === undefined ? [] : ['', `schedule: seed ${schedule.seed}`, '']

const recordPartsOf = <E>(input: FailureRecordInput<E>, layers: ReadonlyArray<Opaque>): RecordParts => {
  const chosen = chosenFrameOf(layers)
  return {
    headline: headlineOf(layers),
    raisedAt: raisedAtLineOf(chosen, input.spans),
    failingStep: failingStepLineOf(input.spans),
    detail: detailOf(layers),
    chain: chainLinesOf(layers, chosen),
    trail: trailLinesOf(input.spans),
    schedule: scheduleLinesOf(input.schedule),
    rerun: rerunLinesOf(input.identity, input.replay, propertyReplayTextOf(input.failure)),
  }
}

const maybeLine = (line: string | undefined): ReadonlyArray<string> => line === undefined ? [] : [line]

const sectionLines = (header: string, lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines.length === 0 ? [] : [header, ...lines, '']

const linesOf = (parts: RecordParts): ReadonlyArray<string> => [
  parts.headline,
  ...maybeLine(parts.raisedAt),
  parts.failingStep,
  ...detailLinesOf(parts.detail),
  '',
  ...sectionLines('Cause chain:', parts.chain),
  ...sectionLines('Steps and the decisions each caused:', parts.trail),
  ...parts.schedule,
  ...parts.rerun,
]

const breachIf = (holds: boolean, breach: Breach): ReadonlyArray<Breach> => holds ? [breach] : []

const r6Broken = <E>(parts: RecordParts, input: FailureRecordInput<E>): boolean =>
  or(parts.rerun.length === 0, replayOnBaseline(input.replay))

const breachesOf = <E>(parts: RecordParts, input: FailureRecordInput<E>, record: string): ReadonlyArray<Breach> => [
  ...breachIf(parts.headline.length === 0, 'R1'),
  ...breachIf(not(LOCATION.test(record)), 'R2'),
  ...breachIf(r6Broken(parts, input), 'R6'),
]

const hasRoot = (root: string | undefined): root is string => root !== undefined && root.length > 0

const relativize = (record: string, root: string | undefined): string =>
  hasRoot(root) ? record.replaceAll(`${root}/`, '') : record

/**
 * Renders the record Vitest prints for one spec failure, and the contract rules it breaks.
 *
 * Never throws: a `Cause` renders layer by layer, a thrown `Error` renders as one layer, and any other value
 * renders as itself. The first location the record names is the raising frame — the first stack frame outside
 * `node_modules` and outside the spec libraries' own `src/` and `dist/` — and when no layer has one, the
 * innermost failed span's site stands in, or the innermost unfinished cell's decide site for a deadlock (KTD6).
 *
 * @internal
 */
export const renderFailureRecord = <E>(input: FailureRecordInput<E>): FailureRecord => {
  const layers = layersOf(input.failure)
  const parts = recordPartsOf(input, layers)
  const record = relativize(linesOf(parts).join('\n').trimEnd(), input.root)
  const property = propertyFailureOf(input.failure)
  return {
    name: nameOf(layers),
    record,
    breaches: breachesOf(parts, input, record),
    ...(property === undefined ? {} : { failure: property }),
  }
}

const RECORD = Symbol.for('@systemfsoftware/vitest/FailureRecord')

const DIFF_FIELDS: ReadonlyArray<string> = ['actual', 'expected', 'showDiff', 'operator', 'diff']

const ERROR_CAUSE_DEPTH = 8

const isDiffLayer = (value: object): boolean => fieldOf(value, 'actual') !== undefined

const marked = (error: Error): Error => {
  Object.defineProperty(error, RECORD, { value: true })
  return error
}

const recordSiteOf = (text: string): string | undefined => LOCATION.exec(text)?.[0]

const withoutTag = (record: FailureRecord): string => {
  const prefix = `${record.name}: `
  return record.record.startsWith(prefix) ? record.record.slice(prefix.length) : record.record
}

const recordStackOf = (record: FailureRecord, message: string): string => {
  const head = `${record.name}: ${message}`
  const site = recordSiteOf(record.record)
  return site === undefined ? head : `${head}\n    at ${site}`
}

const withStack = (error: Error, record: FailureRecord, message: string): Error => {
  error.stack = recordStackOf(record, message)
  return error
}

const withName = (error: Error, name: string): Error => {
  error.name = name
  return error
}

const reasonFieldOf = (reason: object): Opaque => fieldOf(reason, 'error') ?? fieldOf(reason, 'defect')

const firstReasonOf = (cause: Cause.Cause<Opaque>): Opaque => {
  const reason = cause.reasons[0]
  return reason === undefined ? cause : reasonFieldOf(reason)
}

const payloadOf = (failure: Opaque): Opaque => Cause.isCause(failure) ? firstReasonOf(failure) : failure

const errorCauseChainOf = (value: Opaque, depth: number): ReadonlyArray<Opaque> =>
  depth <= 0 ? [] : [value, ...chainedCausesOf(value, depth)]

const chainedCausesOf = (value: Opaque, depth: number): ReadonlyArray<Opaque> => {
  const cause = causeFieldOf(value)
  return cause === undefined ? [] : errorCauseChainOf(cause, depth - 1)
}

const layerChainOf = (failure: Opaque): ReadonlyArray<Opaque> => {
  const first = payloadOf(failure)
  return [first, ...chainedCausesOf(first, ERROR_CAUSE_DEPTH)]
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

/**
 * The property-channel failure tags: a failure whose own fields ride onto the printed error and stay readable from
 * the corpus record (R1, R2, R8). Tags, not the classes, so this module never imports the property engine.
 */
const PROPERTY_FAILURE_TAGS: ReadonlyArray<string> = [
  'PropertyRefuted',
  'NonBooleanVerdict',
  'CoverageBelowMinimum',
  'SelfModelLaw',
  'SeedStoreUnreadable',
  'ReplayUnreadable',
  'VacuousProperty',
]

const isPropertyFailureLayer = (value: object): boolean => {
  const tag = tagFieldOf(value)
  return tag !== undefined && PROPERTY_FAILURE_TAGS.includes(tag)
}

const propertyFailureOf = (failure: Opaque): object | undefined =>
  layerChainOf(failure).map(objectOrUndefined).filter(isObject).find(isPropertyFailureLayer)

/**
 * Copies the property failure's `_tag` and every own field onto the printed error, so a reporter reading the raw
 * error sees them. The message and stack stay untouched.
 */
const copyOwnFields = (error: Error, layer: object): Error => {
  for (const field of Object.keys(layer)) copyField(error, layer, field)
  return error
}

const copyPropertyFields = (error: Error, failure: Opaque): Error => {
  const layer = propertyFailureOf(failure)
  return layer === undefined ? error : copyOwnFields(error, layer)
}

/**
 * The `Error` Vitest prints for one record (R2, R7, R8): its `name` is the record's failure tag, its `message` is
 * the record, and its `stack` leads with that message — Vitest's JSON reporter hands a consumer `stack || message`,
 * so the record has to ride there too — followed by the record's first location, so no `effect` or library frame
 * stays. The tag is left out of the message because Vitest prints `name: message`: it would otherwise lead twice.
 *
 * A failure that carries a diff — Chai's `actual`, `expected`, `showDiff`, `operator` and Vitest's `diff` — has
 * those fields copied from the innermost layer that holds them, because Vitest renders its Expected/Received
 * block from the thrown error, not from the record text.
 *
 * @internal
 */
export const failureRecordError = (record: FailureRecord): Error => {
  const message = withoutTag(record)
  return marked(withStack(withName(new Error(message), record.name), record, message))
}

const isRefusalFailure = (value: Opaque): value is FailureRecordRefused => Schema.is(FailureRecordRefused)(value)

/**
 * The refusal thrown in a record's place (R10, KTD7): fixed prose naming each breach, the original failure as its
 * `cause`, and the record that failure would have printed beneath it. The record rides in the stack because
 * Vitest's JSON reporter hands a consumer `stack || message`, where a cause is invisible; the prose never carries
 * record text and is never read back, so a refusal cannot recurse.
 */
const refusalError = (failure: Opaque, record: FailureRecord): Error => {
  const refusal = new FailureRecordRefused({ breaches: record.breaches, cause: failure })
  refusal.stack = `${refusal.name}: ${refusal.message}\n${failureRecordError(record).stack ?? ''}`
  return refusal
}

const printedError = (failure: Opaque, record: FailureRecord): Error =>
  record.breaches.length > 0 ? refusalError(failure, record) : failureRecordError(record)

/** @internal */
export const isFailureRecordError = (value: Opaque): value is Error =>
  isObject(value) && fieldOf(value, RECORD) === true

/** @internal */
export const throwFailureRecord = <E>(input: FailureRecordInput<E>): never => {
  if (isRefusalFailure(input.failure)) throw input.failure
  const record = renderFailureRecord(input)
  const printed = copyDiffFields(printedError(input.failure, record), input.failure)
  throw copyPropertyFields(printed, input.failure)
}

const LEVEL_SEPARATOR = ' > '
const EMPTY_TEXT = ''

interface TaskLike {
  readonly name?: string | undefined
  readonly fullName?: string | undefined
  readonly fullTestName?: string | undefined
}

const textOrEmpty = (value: string | undefined): string => isText(value) ? value : EMPTY_TEXT

const firstNonEmptyText = (values: ReadonlyArray<string | undefined>): string => textOrEmpty(values.find(isText))

const fileOf = (fullName: string | undefined): string =>
  textOrEmpty(fullName).split(LEVEL_SEPARATOR).at(0) ?? EMPTY_TEXT

const identityOf = (task: TaskLike): TestIdentity => ({
  package: providedPackage() ?? EMPTY_TEXT,
  file: fileOf(task.fullName),
  name: firstNonEmptyText([task.fullTestName, task.name]),
})

const currentTask = (): TaskLike => TestRunner.getCurrentTest() ?? {}

/** @internal */
export const testIdentityOf = (task?: TaskLike | null): TestIdentity => identityOf(task ?? currentTask())

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
import * as Tracer from 'effect/Tracer'

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
  /** The decisions or inputs the generator chose, in order. */
  readonly path: ReadonlyArray<AttributeValue>
}

/**
 * A contract rule a rendered record breaks; the runner refuses such a record (R10, KTD7).
 *
 * @internal
 */
export type Breach = 'R1' | 'R2' | 'R6'

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
const CELL_SITE = 'cell.site'
const CELL_DECIDE_SITE = 'cell.decide_site'
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
const FRAME_AT = 'at '
const FRAME_PAREN = ' ('
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

/** A stack frame's location, with the `file://` prefix a Node stack may carry. */
const FRAME_LOCATION = /\s\(?((?:file:\/\/)?[^()\s]+):(\d+):(\d+)\)?$/u

const COLUMN_SUFFIX = /:\d+$/u

/** The libraries whose own frames never lead the record (KTD6). */
const LIBRARY_DIRS: ReadonlyArray<string> = [
  'runner/vitest',
  'effect-spec-runtime',
  'effect-cell-types',
  'effect-gherkin-spec',
  'storybook-gherkin',
  'conformance-spec',
  'differential-spec',
  'trace-spec',
  'effect-daemon-spec',
]

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

const fieldOf = (value: object, key: string): Opaque => Reflect.get(value, key)

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

const pairTextOf = (pair: Pair): string => `${pair.name}: ${pair.text}`

const pairTextsOf = (pairs: ReadonlyArray<Pair>): ReadonlyArray<string> => pairs.map(pairTextOf)

const hasPair = (pairs: ReadonlyArray<Pair>, name: string): boolean => pairs.some((pair) => pair.name === name)

const pairsOf = (value: Opaque): ReadonlyArray<Pair> =>
  isObject(value) ? Object.keys(value).map((key) => pairOf(key, renderValue(fieldOf(value, key)))) : []

const fieldsOf = (value: object): ReadonlyArray<Pair> => pairsOf(value).filter((pair) => isFieldName(pair.name))

const renderValue = (value: Opaque): string => isObject(value) ? renderObject(value) : renderScalar(value)

const renderScalar = (value: Opaque): string => isText(value) ? value : renderPrimitive(value)

const renderPrimitive = (value: Opaque): string => isPrimitive(value) ? `${value}` : renderOther(value)

const renderOther = (value: Opaque): string => isNull(value) ? 'null' : renderUndefined(value)

const renderUndefined = (value: Opaque): string => value === undefined ? 'undefined' : renderContainer(value)

const renderContainer = (value: Opaque): string => isArray(value) ? renderList(value) : typeof value

const renderList = (value: ReadonlyArray<Opaque>): string => `[${value.map(renderValue).join('; ')}]`

const renderObject = (value: object): string => tagFieldOf(value) ?? renderRecord(value)

const renderRecord = (value: object): string => `{${pairTextsOf(pairsOf(value)).join('; ')}}`

const renderFields = (value: object): string => `{${pairTextsOf(fieldsOf(value)).join('; ')}}`

const summaryOf = (value: Opaque): string => isObject(value) ? objectSummaryOf(value) : renderScalar(value)

const objectSummaryOf = (value: object): string => {
  const tag = tagFieldOf(value)
  return tag === undefined ? errorSummaryOf(value) : taggedSummaryOf(tag, value)
}

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

interface RaisedFrame {
  readonly path: string
  readonly line: string
  readonly fn: string | undefined
}

const stripProtocol = (path: string): string => path.startsWith(FILE_PROTOCOL) ? path.slice(FILE_PROTOCOL.length) : path

const stripColumn = (site: string): string => site.replace(COLUMN_SUFFIX, '')

const knownSiteOf = (site: Opaque): string | undefined => isText(site) ? stripColumn(stripProtocol(site)) : undefined

const siteTextOf = (site: Opaque): string => knownSiteOf(site) ?? UNKNOWN_SITE

const isVendoredPath = (path: string): boolean => or(path.includes('node_modules'), path.startsWith('node:'))

const isLibraryPath = (path: string): boolean =>
  LIBRARY_DIRS.some((dir) => or(path.includes(`/${dir}/src/`), path.includes(`/${dir}/dist/`)))

const isUserPath = (path: string): boolean => not(isVendoredPath(path)) && not(isLibraryPath(path))

const beforeParen = (rest: string): string | undefined => {
  const paren = rest.indexOf(FRAME_PAREN)
  return paren < 0 ? undefined : rest.slice(0, paren)
}

const frameNameIn = (rest: string): string | undefined => nonEmptyText(beforeParen(rest))

const frameNameOf = (line: string): string | undefined =>
  line.startsWith(FRAME_AT) ? frameNameIn(line.slice(FRAME_AT.length)) : undefined

const frameWithLine = (path: string, line: string | undefined, fn: string | undefined): RaisedFrame | undefined =>
  line === undefined ? undefined : { path: stripProtocol(path), line, fn }

const raisedFrameOf = (
  path: string | undefined,
  line: string | undefined,
  fn: string | undefined,
): RaisedFrame | undefined => path === undefined ? undefined : frameWithLine(path, line, fn)

const frameOf = (line: string): RaisedFrame | undefined => {
  const match = FRAME_LOCATION.exec(line)
  if (match === null) return undefined
  return raisedFrameOf(match[1], match[2], frameNameOf(line))
}

const isFrame = (frame: RaisedFrame | undefined): frame is RaisedFrame => frame !== undefined

const stackIn = (value: object): string => textFieldOf(value, STACK_FIELD) ?? ''

const stackOf = (value: Opaque): string => isObject(value) ? stackIn(value) : ''

const framesOf = (value: Opaque): ReadonlyArray<RaisedFrame> =>
  stackOf(value).split('\n').map((line) => frameOf(line.trim())).filter(isFrame)

const usableFrameOf = (value: Opaque): RaisedFrame | undefined =>
  framesOf(value).find((frame) => isUserPath(frame.path))

const frameTextOf = (frame: RaisedFrame): string => `${frame.path}:${frame.line}${frameNameSuffix(frame.fn)}`

const frameNameSuffix = (fn: string | undefined): string => fn === undefined ? '' : ` (${fn})`

const isSameSite = (frame: RaisedFrame, other: RaisedFrame): boolean =>
  and(frame.path === other.path, frame.line === other.line)

const isSameFrame = (frame: RaisedFrame, other: RaisedFrame | undefined): boolean =>
  other === undefined ? false : isSameSite(frame, other)

const chosenFrameOf = (layers: ReadonlyArray<Opaque>): RaisedFrame | undefined => {
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

const isCellSpan = (span: Tracer.NativeSpan): boolean => isText(attrOf(span, CELL_SITE))

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

const pairsBracesOf = (cell: Tracer.NativeSpan): string => `{${pairTextsOf(cellPairsOf(cell)).join(', ')}}`

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
  tail: `        decide ${siteTextOf(attrOf(cell, CELL_DECIDE_SITE))}   cell ${siteTextOf(attrOf(cell, CELL_SITE))}`,
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
  knownSiteOf(attrOf(span, CODE_SITE)) ?? knownSiteOf(attrOf(span, CELL_SITE))

const cellSiteOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined => {
  const cell = spans.toReversed().find(isCellSpan)
  return cell === undefined ? undefined : spanSiteOf(cell)
}

const unfinishedDecideSiteOf = (spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined => {
  const unfinished = spans.toReversed().find(isUnfinishedCell)
  return unfinished === undefined ? undefined : knownSiteOf(attrOf(unfinished, CELL_DECIDE_SITE))
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

const raisedAtLineOf = (frame: RaisedFrame | undefined, spans: ReadonlyArray<Tracer.NativeSpan>): string | undefined =>
  frame === undefined ? fallbackRaisedAtLineOf(spans) : `  raised at ${frameTextOf(frame)}`

const chainNamedFrame = (frame: RaisedFrame, chosen: RaisedFrame | undefined): string =>
  isSameFrame(frame, chosen) ? '' : `   raised at ${frameTextOf(frame)}`

const chainFrameTextOf = (frame: RaisedFrame | undefined, chosen: RaisedFrame | undefined): string =>
  frame === undefined ? '' : chainNamedFrame(frame, chosen)

const chainLineOf = (layer: Opaque, chosen: RaisedFrame | undefined): string =>
  `  ${summaryOf(layer)}${chainFrameTextOf(usableFrameOf(layer), chosen)}`

const chainLinesOf = (layers: ReadonlyArray<Opaque>, chosen: RaisedFrame | undefined): ReadonlyArray<string> =>
  layers.slice(1).map((layer) => chainLineOf(layer, chosen))

const quoted = (text: string): string => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

const renderEntryNonNull = (value: EntryNoText): string => isNull(value) ? 'null' : renderEntryValue(value)

const renderEntryValue = (value: EntryNoNull): string => isPrimitive(value) ? `${value}` : renderEntryStructure(value)

const renderEntryStructure = (value: EntryStructure): string =>
  isArray(value) ? renderEntryList(value) : renderEntryRecord(value)

const renderEntryList = (value: ReadonlyArray<AttributeValue>): string => `[${value.map(renderEntry).join(';')}]`

const renderEntryRecord = (value: { readonly [key: string]: AttributeValue }): string =>
  `{${Object.entries(value).map(([key, entry]) => `${key}: ${renderEntry(entry)}`).join(';')}}`

const renderEntry = (value: AttributeValue): string => isText(value) ? quoted(value) : renderEntryNonNull(value)

const replayTextOf = (replay: ReplayValue): string | undefined =>
  replay.seed === undefined ? undefined : `seed=${replay.seed};path=${replay.path.map(renderEntry).join(',')}`

const replayPrefixText = (text: string | undefined): string => text === undefined ? '' : `CONFORMANCE_REPLAY="${text}" `

const replayPrefixOf = (replay: ReplayValue | undefined): string =>
  replayPrefixText(replay === undefined ? undefined : replayTextOf(replay))

const isCompleteIdentity = (identity: TestIdentity): boolean => and(identity.file.length > 0, identity.name.length > 0)

const filterPrefixOf = (identity: TestIdentity): string =>
  identity.package.length === 0 ? '' : `pnpm --filter ${identity.package} exec `

const rerunLineOf = (identity: TestIdentity, replay: ReplayValue | undefined): string | undefined =>
  isCompleteIdentity(identity)
    ? `  ${replayPrefixOf(replay)}${filterPrefixOf(identity)}vitest run ${identity.file} -t ` +
      quoted(identity.name)
    : undefined

const rerunLinesOf = (identity: TestIdentity, replay: ReplayValue | undefined): ReadonlyArray<string> => {
  const line = rerunLineOf(identity, replay)
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
    rerun: rerunLinesOf(input.identity, input.replay),
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
  return {
    name: nameOf(layers),
    record,
    breaches: breachesOf(parts, input, record),
  }
}

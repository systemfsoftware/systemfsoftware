/**
 * Patterns: uncertainty-aware, composable predicates over one input.
 *
 * A pattern is either a semantic leaf (a question asked of a `DecisionModel`
 * through a decision node) or a three-valued composition of other patterns.
 * Kleene semantics govern the boolean algebra: `Miss` dominates conjunction,
 * `Match` dominates disjunction, and negation swaps `Match` and `Miss` while
 * preserving `Uncertain`.
 */
import { Array as Arr, Match } from 'effect'
import type * as Effect from 'effect/Effect'
import { dual, identity } from 'effect/Function'
import * as Option from 'effect/Option'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import type * as Schema from 'effect/Schema'
import type * as Decision from 'effect/unstable/ai/Decision'
import { hash } from './decision-model.blueprint.js'
import type { PatternAst } from './PatternAst.schema.js'
import { PatternMatched, PatternMissed, PatternUncertain } from './Verdict.schema.js'
import type { PatternResult, PatternStatus } from './Verdict.schema.js'

/** The validated answers one observation batch returned, keyed by decision id. */
export type Answers = Readonly<Record<string, Decision.Answer<Decision.Any>>>

/** Options shared by every pattern constructed from a decision node or a guard. */
export interface LeafOptions {
  readonly id?: string | undefined
  readonly description?: string | undefined
}

/**
 * A decision node as the rest of the package consumes it: its identity, its
 * decision definition, and the input schema it was bound to. Interpretation
 * methods live on {@link DecisionNode}; patterns, plans, and observation
 * batches only ever need this shape.
 */
export interface NodeCore {
  readonly id: string
  readonly fingerprint: string
  readonly decision: Decision.Any
  readonly schema: Schema.Constraint | undefined
}

/** A named semantic question bound to the input it is asked about. */
export interface DecisionNode<
  in Input = unknown,
  D extends Decision.Any = Decision.Any,
  S extends Schema.Constraint | undefined = undefined,
> extends NodeCore, Pipeable {
  readonly decision: D
  readonly schema: S
  /** A binary custom interpretation. Prefer `whereResult` when uncertainty matters. */
  readonly where: (predicate: (answer: Decision.Answer<D>) => boolean, options?: LeafOptions) => Pattern<Input>
  /** A custom tri-state interpretation of this semantic answer. */
  readonly whereResult: (
    resolve: (answer: Decision.Answer<D>) => PatternResult,
    options?: LeafOptions,
  ) => Pattern<Input>
}

/** The result of evaluating the deterministic structure of a pattern. */
export interface Preview {
  readonly resolved: PatternResult | undefined
  readonly decisions: ReadonlyArray<NodeCore>
}

/** The bounds a caller crossed when naming thresholds, carried to the run that evaluates the leaf. */
export interface PatternRefusal {
  readonly threshold: string
  readonly value: number
  readonly limit: number
  readonly message: string
}

/** A composable, three-valued predicate over one input. */
export interface Pattern<in Input = never> extends Pipeable {
  readonly [PatternTypeId]: typeof PatternTypeId
  readonly [PatternEvaluatorTypeId]: PatternEvaluator<Input>
  readonly id: string
  readonly decisions: ReadonlyArray<NodeCore>
  readonly ast: PatternAst
  /** Thresholds a caller crossed building this pattern; the run refuses instead of judging. */
  readonly refusals: ReadonlyArray<PatternRefusal>
}

/** The evaluation closures a pattern carries; reached only through {@link evaluate} and {@link preview}. */
export interface PatternEvaluator<in Input = never> {
  readonly evaluate: (input: Input, answers: Answers) => PatternResult
  readonly preview: (input: Input) => Preview
}

/** Resolve one pattern for one input against already-observed answers. */
export const evaluate: {
  <Input>(input: Input, answers: Answers): (self: Pattern<Input>) => PatternResult
  <Input>(self: Pattern<Input>, input: Input, answers: Answers): PatternResult
} = dual(
  3,
  <Input>(self: Pattern<Input>, input: Input, answers: Answers): PatternResult =>
    self[PatternEvaluatorTypeId].evaluate(input, answers),
)

/** Resolve what the deterministic structure of one pattern already settles for one input. */
export const preview: {
  <Input>(input: Input): (self: Pattern<Input>) => Preview
  <Input>(self: Pattern<Input>, input: Input): Preview
} = dual(
  2,
  <Input>(self: Pattern<Input>, input: Input): Preview => self[PatternEvaluatorTypeId].preview(input),
)
/** What a case handler may return: a bare value or an Effect producing one. */
export type HandlerResult<Value, Err, Req> = Value | Effect.Effect<Value, Err, Req>

/** The uncertainty a case resolved to, handed to an uncertain handler. */
export interface UncertainContext {
  readonly caseId: string
  readonly result: PatternResult
}

const PatternTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Pattern')

const PatternEvaluatorTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Pattern/evaluator')

// -------------------------------------------------------------------------------------------------
// Verdict constructors
// -------------------------------------------------------------------------------------------------

/** A `Match` verdict, optionally with a reason. */
export const matched = (reason?: string): PatternResult =>
  reason === undefined ? new PatternMatched({}) : new PatternMatched({ reason })

/** A `Miss` verdict, optionally with a reason. */
export const missed = (reason?: string): PatternResult =>
  reason === undefined ? new PatternMissed({}) : new PatternMissed({ reason })

/** An `Uncertain` verdict, optionally with a reason. */
export const uncertain = (reason?: string): PatternResult =>
  reason === undefined ? new PatternUncertain({}) : new PatternUncertain({ reason })

/** The status literal of a verdict, read through `Match` rather than the tag. */
export const statusOf = (result: PatternResult): PatternStatus =>
  Match.value(result).pipe(
    Match.tag('Match', () => 'Match' as const),
    Match.tag('Miss', () => 'Miss' as const),
    Match.tag('Uncertain', () => 'Uncertain' as const),
    Match.exhaustive,
  )

/** The reason a verdict carries, if any. */
export const reasonOf = (result: PatternResult): string | undefined =>
  Match.value(result).pipe(
    Match.tag('Match', (found) => found.reason),
    Match.tag('Miss', (found) => found.reason),
    Match.tag('Uncertain', (found) => found.reason),
    Match.exhaustive,
  )

const isStatus = (status: PatternStatus): (result: PatternResult) => boolean => {
  const is = (result: PatternResult): boolean => statusOf(result) === status
  return is
}

/** Whether a possibly-absent resolution carries the given status. */
export const statusIs: {
  (status: PatternStatus): (resolved: PatternResult | undefined) => boolean
  (resolved: PatternResult | undefined, status: PatternStatus): boolean
} = dual(
  2,
  (resolved: PatternResult | undefined, status: PatternStatus): boolean =>
    Option.match(Option.fromNullishOr(resolved), {
      onNone: () => false,
      onSome: (result) => statusOf(result) === status,
    }),
)

// -------------------------------------------------------------------------------------------------
// Previews
// -------------------------------------------------------------------------------------------------

const settledPreview = (resolved: PatternResult): Preview => ({ resolved, decisions: [] })

const openPreview = (decisions: ReadonlyArray<NodeCore>): Preview => ({ resolved: undefined, decisions })

const undecidedOf = (preview: Preview): ReadonlyArray<NodeCore> =>
  preview.resolved === undefined ? preview.decisions : []

/** The verdict a set of previews already resolved to the given status, if any. */
const settledOn = (parts: ReadonlyArray<Preview>, status: PatternStatus): Option.Option<PatternResult> =>
  Option.flatMap(
    Arr.findFirst(parts, (part) => statusIs(part.resolved, status)),
    (part) => Option.fromNullishOr(part.resolved),
  )

/** Whether every preview resolved to the given status. */
const unanimousOn = (parts: ReadonlyArray<Preview>, status: PatternStatus): boolean =>
  Arr.every(parts, (part) => statusIs(part.resolved, status))

/** How a composition resolves when unanimity decides it. */
const unanimousKindOf = (unanimous: boolean): 'unanimous' | 'open' => (unanimous ? 'unanimous' : 'open')

const composedPreview = <Input>(
  patterns: ReadonlyArray<Pattern<Input>>,
  input: Input,
  dominant: PatternStatus,
  unanimous: PatternStatus,
  unanimousVerdict: PatternResult,
): Preview => {
  const parts = Arr.map(patterns, (pattern) => preview(pattern, input))
  return Option.match(settledOn(parts, dominant), {
    onNone: () =>
      Match.value(unanimousKindOf(unanimousOn(parts, unanimous))).pipe(
        Match.when('unanimous', () => settledPreview(unanimousVerdict)),
        Match.when('open', () => openPreview(distinctNodes(Arr.flatMap(parts, undecidedOf)))),
        Match.exhaustive,
      ),
    onSome: (resolved) => settledPreview(resolved),
  })
}

const andPreview = <Input>(patterns: ReadonlyArray<Pattern<Input>>, input: Input): Preview =>
  composedPreview(patterns, input, 'Miss', 'Match', matched())

const orPreview = <Input>(patterns: ReadonlyArray<Pattern<Input>>, input: Input): Preview =>
  composedPreview(patterns, input, 'Match', 'Miss', missed())

// -------------------------------------------------------------------------------------------------
// Pattern assembly
// -------------------------------------------------------------------------------------------------

const makePattern = <Input>(parts: {
  readonly id: string
  readonly decisions: ReadonlyArray<NodeCore>
  readonly ast: PatternAst
  readonly refusals: ReadonlyArray<PatternRefusal>
  readonly evaluate: (input: Input, answers: Answers) => PatternResult
  readonly preview: (input: Input) => Preview
}): Pattern<Input> => ({
  [PatternTypeId]: PatternTypeId,
  [PatternEvaluatorTypeId]: { evaluate: parts.evaluate, preview: parts.preview },
  id: parts.id,
  decisions: parts.decisions,
  ast: parts.ast,
  refusals: parts.refusals,
  ...Prototype,
})

export interface SemanticLeafOptions {
  readonly node: NodeCore
  readonly id: string
  readonly description: string | undefined
  readonly resolve: (answers: Answers) => PatternResult
  readonly refusals?: ReadonlyArray<PatternRefusal> | undefined
}

export const semanticLeaf = <Input>(options: SemanticLeafOptions): Pattern<Input> =>
  makePattern({
    id: options.id,
    decisions: [options.node],
    ast: { kind: 'Semantic', id: options.id, decisionId: options.node.id, description: options.description },
    refusals: options.refusals ?? [],
    evaluate: (_input, answers) => options.resolve(answers),
    preview: () => openPreview([options.node]),
  })

const keepFirst = (previous: NodeCore | undefined, node: NodeCore): NodeCore => previous === undefined ? node : previous

/**
 * Collapse decision nodes that repeat exactly (same id and fingerprint), and
 * keep everything else — including a repeated id whose definitions differ, so
 * the observation batch that is built from these nodes can refuse the
 * collision by id (`decisionsOf` in decision.blueprint.ts). One decision id
 * must mean one definition, or the recorded observations of the two would be
 * indistinguishable.
 */
export const distinctNodes = (nodes: ReadonlyArray<NodeCore>): ReadonlyArray<NodeCore> => {
  const seen = new Set<string>()
  const kept: Array<NodeCore> = []
  const keepNew = (node: NodeCore): void => {
    const identity = `${node.id}\u0000${node.fingerprint}`
    if (seen.has(identity)) return
    seen.add(identity)
    kept.push(node)
  }
  nodes.forEach(keepNew)
  return kept
}

/**
 * Collapse decision nodes that share an id, keeping the first of every id.
 * Used where the observation record is built so a repeated definition is
 * refused with the colliding id instead of silently winning.
 */
export const distinctFirstById = (nodes: ReadonlyArray<NodeCore>): ReadonlyArray<NodeCore> => {
  const byId = new Map<string, NodeCore>()
  for (const node of nodes) byId.set(node.id, keepFirst(byId.get(node.id), node))
  return [...byId.values()]
}

/** Collapse the decision nodes reachable from a set of patterns. */
export const distinctDecisions = (patterns: ReadonlyArray<Pattern<never>>): ReadonlyArray<NodeCore> =>
  distinctNodes(Arr.flatMap(patterns, (pattern) => pattern.decisions))

// -------------------------------------------------------------------------------------------------
// Kleene composition
// -------------------------------------------------------------------------------------------------

const isMiss = isStatus('Miss')
const isUncertain = isStatus('Uncertain')

/** Kleene AND over verdicts: `Miss` dominates; otherwise `Uncertain` dominates. */
export const andResult = (results: ReadonlyArray<PatternResult>): PatternResult =>
  Option.match(Arr.findFirst(results, isMiss), {
    onSome: identity,
    onNone: () => Option.getOrElse(Arr.findFirst(results, isUncertain), matched),
  })

/** Kleene OR over verdicts: `Match` dominates; otherwise `Uncertain` dominates. */
export const orResult = (results: ReadonlyArray<PatternResult>): PatternResult =>
  Option.match(Arr.findFirst(results, isStatus('Match')), {
    onSome: identity,
    onNone: () => Option.getOrElse(Arr.findFirst(results, isUncertain), missed),
  })

/** Negation preserves `Uncertain` and swaps `Match` and `Miss`. */
const negate = (result: PatternResult): PatternResult =>
  Match.value(statusOf(result)).pipe(
    Match.when('Match', () => missed(reasonOf(result))),
    Match.when('Miss', () => matched(reasonOf(result))),
    Match.when('Uncertain', () => result),
    Match.exhaustive,
  )
/** Kleene-style three-valued AND: `Miss` dominates; otherwise `Uncertain` dominates. */
export const and = <Input>(...patterns: ReadonlyArray<Pattern<Input>>): Pattern<Input> => andAll(patterns)

/** Kleene-style three-valued AND over an explicit pattern list: `Miss` dominates; otherwise `Uncertain` dominates. */
export const andAll = <Input>(patterns: ReadonlyArray<Pattern<Input>>): Pattern<Input> =>
  makePattern({
    id: `and_${hash(Arr.map(patterns, (pattern) => pattern.id))}`,
    decisions: distinctDecisions(patterns),
    ast: { kind: 'And', patterns: Arr.map(patterns, (pattern) => pattern.ast) },
    refusals: Arr.flatMap(patterns, (pattern) => pattern.refusals),
    evaluate: (input, answers) => andResult(Arr.map(patterns, (pattern) => evaluate(pattern, input, answers))),
    preview: (input) => andPreview(patterns, input),
  })

/** Kleene-style three-valued OR: `Match` dominates; otherwise `Uncertain` dominates. */
export const or = <Input>(...patterns: ReadonlyArray<Pattern<Input>>): Pattern<Input> => orAll(patterns)

/** Kleene-style three-valued OR over an explicit pattern list: `Match` dominates; otherwise `Uncertain` dominates. */
export const orAll = <Input>(patterns: ReadonlyArray<Pattern<Input>>): Pattern<Input> =>
  makePattern({
    id: `or_${hash(Arr.map(patterns, (pattern) => pattern.id))}`,
    decisions: distinctDecisions(patterns),
    ast: { kind: 'Or', patterns: Arr.map(patterns, (pattern) => pattern.ast) },
    refusals: Arr.flatMap(patterns, (pattern) => pattern.refusals),
    evaluate: (input, answers) => orResult(Arr.map(patterns, (pattern) => evaluate(pattern, input, answers))),
    preview: (input) => orPreview(patterns, input),
  })

const notPreview = <Input>(self: Pattern<Input>, input: Input): Preview => {
  const inner = preview(self, input)
  return Option.match(Option.fromNullishOr(inner.resolved), {
    onNone: () => inner,
    onSome: (resolved) => settledPreview(negate(resolved)),
  })
}

/**
 * Negation preserves `Uncertain` and swaps `Match` and `Miss`.
 *
 * The public `not` lives in decision.blueprint.ts, where the classification
 * reading of `not(node, label)` is decided beside the node's own answer
 * check; this is its pattern half.
 */
export const notPattern = <Input>(self: Pattern<Input>): Pattern<Input> =>
  makePattern({
    id: `not_${self.id}`,
    decisions: self.decisions,
    ast: { kind: 'Not', pattern: self.ast },
    refusals: self.refusals,
    evaluate: (input, answers) => negate(evaluate(self, input, answers)),
    preview: (input) => notPreview(self, input),
  })

// -------------------------------------------------------------------------------------------------
// Deterministic guards
// -------------------------------------------------------------------------------------------------

const guardDescriptionOf = (guard: (input: never) => boolean, description: string | undefined): string =>
  description ?? String(guard)

const guardIdOf = (opts: LeafOptions, guard: (input: never) => boolean): string =>
  opts.id ?? `guard_${hash(guardDescriptionOf(guard, opts.description))}`

/** A deterministic predicate that composes with semantic patterns and costs no model call. */
export const deterministic: {
  <Input>(options?: LeafOptions): (guard: (input: Input) => boolean) => Pattern<Input>
  <Input>(guard: (input: Input) => boolean, options?: LeafOptions): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'function',
  <Input>(guard: (input: Input) => boolean, options?: LeafOptions): Pattern<Input> => {
    const opts: LeafOptions = options ?? {}
    const id = guardIdOf(opts, guard)
    return makePattern({
      id,
      decisions: [],
      ast: { kind: 'Deterministic', id, description: opts.description },
      refusals: [],
      evaluate: (input) => (guard(input) ? matched() : missed()),
      preview: (input) => settledPreview(guard(input) ? matched() : missed()),
    })
  },
)

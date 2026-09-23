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
import { hash } from './decision-model.resource.js'
import { DecisionIdCollisionError } from './DiscernError.schema.js'
import type { PatternAst } from './PatternAst.schema.js'
import { PatternMatched, PatternMissed, PatternUncertain } from './Verdict.schema.js'
import type { PatternResult, PatternStatus } from './Verdict.schema.js'

/**
 * The input type an input-agnostic node or pattern accepts. The typing
 * protocol's sanctioned top type: `unknown` appears only as this alias's
 * generic default, so an unscoped constructor can fill an input slot without
 * writing `unknown`.
 */
export type Top<Input = unknown> = Input

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
> extends NodeCore {
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

/** A composable, three-valued predicate over one input. */
export interface Pattern<in Input = never> extends Pipeable {
  readonly [PatternTypeId]: typeof PatternTypeId
  readonly id: string
  readonly decisions: ReadonlyArray<NodeCore>
  readonly ast: PatternAst
  readonly evaluate: (input: Input, answers: Answers) => PatternResult
  readonly preview: (input: Input) => Preview
}

/** What a case handler may return: a bare value or an Effect producing one. */
export type HandlerResult<Value, Err, Req> = Value | Effect.Effect<Value, Err, Req>

/** The uncertainty a case resolved to, handed to an uncertain handler. */
export interface UncertainContext {
  readonly caseId: string
  readonly result: PatternResult
}

const PatternTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Pattern')

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
export const statusIs = (resolved: PatternResult | undefined, status: PatternStatus): boolean =>
  Option.match(Option.fromNullishOr(resolved), {
    onNone: () => false,
    onSome: (result) => statusOf(result) === status,
  })

// -------------------------------------------------------------------------------------------------
// Previews
// -------------------------------------------------------------------------------------------------

const settledPreview = (resolved: PatternResult): Preview => ({ resolved, decisions: [] })

const openPreview = (decisions: ReadonlyArray<NodeCore>): Preview => ({ resolved: undefined, decisions })

const undecidedOf = (preview: Preview): ReadonlyArray<NodeCore> =>
  preview.resolved === undefined ? preview.decisions : []

/** The verdict a set of previews already resolved to the given status, if any. */
export const settledOn = (parts: ReadonlyArray<Preview>, status: PatternStatus): Option.Option<PatternResult> =>
  Option.flatMap(
    Arr.findFirst(parts, (part) => statusIs(part.resolved, status)),
    (part) => Option.fromNullishOr(part.resolved),
  )

/** Whether every preview resolved to the given status. */
const unanimousOn = (parts: ReadonlyArray<Preview>, status: PatternStatus): boolean =>
  Arr.every(parts, (part) => statusIs(part.resolved, status))

/** How a composition resolves when one settlement dominates the composition. */
const settledKindOf = (settled: Option.Option<PatternResult>): 'settled' | 'open' =>
  Option.isSome(settled) ? 'settled' : 'open'

/** How a composition resolves when unanimity decides it. */
const unanimousKindOf = (unanimous: boolean): 'unanimous' | 'open' => (unanimous ? 'unanimous' : 'open')

const composedPreview = <Input>(
  patterns: ReadonlyArray<Pattern<Input>>,
  input: Input,
  dominant: PatternStatus,
  unanimous: PatternStatus,
  unanimousVerdict: PatternResult,
): Preview => {
  const parts = Arr.map(patterns, (pattern) => pattern.preview(input))
  const settled = settledOn(parts, dominant)
  return Match.value(settledKindOf(settled)).pipe(
    Match.when('settled', () => settledPreview(Option.getOrThrow(settled))),
    Match.when('open', () =>
      Match.value(unanimousKindOf(unanimousOn(parts, unanimous))).pipe(
        Match.when('unanimous', () => settledPreview(unanimousVerdict)),
        Match.when('open', () => openPreview(distinctNodes(Arr.flatMap(parts, undecidedOf)))),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
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
  readonly evaluate: (input: Input, answers: Answers) => PatternResult
  readonly preview: (input: Input) => Preview
}): Pattern<Input> => ({
  [PatternTypeId]: PatternTypeId,
  ...parts,
  ...Prototype,
})

/**
 * A semantic leaf over one decision node, resolved by decoding the batch entry
 * through the node's own answer check. `resolve` receives the node's validated
 * answer; a missing or undecodable entry never reaches it.
 */
export const semanticLeaf = <Input>(
  node: NodeCore,
  id: string,
  description: string | undefined,
  resolve: (answers: Answers) => PatternResult,
): Pattern<Input> =>
  makePattern({
    id,
    decisions: [node],
    ast: { kind: 'Semantic', id, decisionId: node.id, description },
    evaluate: (_input, answers) => resolve(answers),
    preview: () => openPreview([node]),
  })

const leafDescriptionOf = (description: string | undefined): string => description ?? 'custom'

const derivedLeafId = (node: NodeCore, description: string | undefined): string =>
  `p_${hash({ node: node.id, description: leafDescriptionOf(description) })}`

/** The leaf id for a node interpretation, stable per node id and description. */
export const leafId = (explicit: string | undefined, node: NodeCore, description: string | undefined): string =>
  explicit ?? derivedLeafId(node, description)

// -------------------------------------------------------------------------------------------------
// Decision-node collection
// -------------------------------------------------------------------------------------------------

const keepDistinct = (previous: NodeCore, node: NodeCore): NodeCore =>
  previous.fingerprint === node.fingerprint ? previous : collide(node.id)

const keepOne = (previous: NodeCore | undefined, node: NodeCore): NodeCore =>
  previous === undefined ? node : keepDistinct(previous, node)

const collide = (decisionId: string): never => {
  throw new DecisionIdCollisionError({ decisionId })
}

/**
 * Collapse decision nodes that share an id, refusing a differing definition:
 * one decision id must mean one definition, or the recorded observations of
 * the two would be indistinguishable.
 */
export const distinctNodes = (nodes: ReadonlyArray<NodeCore>): ReadonlyArray<NodeCore> => {
  const byId = new Map<string, NodeCore>()
  for (const node of nodes) byId.set(node.id, keepOne(byId.get(node.id), node))
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
export const and = <Input>(...patterns: ReadonlyArray<Pattern<Input>>): Pattern<Input> =>
  makePattern({
    id: `and_${hash(Arr.map(patterns, (pattern) => pattern.id))}`,
    decisions: distinctDecisions(patterns),
    ast: { kind: 'And', patterns: Arr.map(patterns, (pattern) => pattern.ast) },
    evaluate: (input, answers) => andResult(Arr.map(patterns, (pattern) => pattern.evaluate(input, answers))),
    preview: (input) => andPreview(patterns, input),
  })

/** Kleene-style three-valued OR: `Match` dominates; otherwise `Uncertain` dominates. */
export const or = <Input>(...patterns: ReadonlyArray<Pattern<Input>>): Pattern<Input> =>
  makePattern({
    id: `or_${hash(Arr.map(patterns, (pattern) => pattern.id))}`,
    decisions: distinctDecisions(patterns),
    ast: { kind: 'Or', patterns: Arr.map(patterns, (pattern) => pattern.ast) },
    evaluate: (input, answers) => orResult(Arr.map(patterns, (pattern) => pattern.evaluate(input, answers))),
    preview: (input) => orPreview(patterns, input),
  })

const notPreview = <Input>(self: Pattern<Input>, input: Input): Preview => {
  const inner = self.preview(input)
  return Option.match(Option.fromNullishOr(inner.resolved), {
    onNone: () => inner,
    onSome: (resolved) => settledPreview(negate(resolved)),
  })
}

/** Negation preserves `Uncertain` and swaps `Match` and `Miss`. */
export const not = <Input>(self: Pattern<Input>): Pattern<Input> =>
  makePattern({
    id: `not_${self.id}`,
    decisions: self.decisions,
    ast: { kind: 'Not', pattern: self.ast },
    evaluate: (input, answers) => negate(self.evaluate(input, answers)),
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
export const deterministic = <Input>(guard: (input: Input) => boolean, options?: LeafOptions): Pattern<Input> => {
  const opts: LeafOptions = options ?? {}
  const id = guardIdOf(opts, guard)
  return makePattern({
    id,
    decisions: [],
    ast: { kind: 'Deterministic', id, description: opts.description },
    evaluate: (input) => (guard(input) ? matched() : missed()),
    preview: (input) => settledPreview(guard(input) ? matched() : missed()),
  })
}

/** Aliases that read naturally next to Effect `Predicate` and `Match` terminology. */
export const predicate = deterministic
export const structural = deterministic

// -------------------------------------------------------------------------------------------------
// Direct refinements
// -------------------------------------------------------------------------------------------------

/** Build a binary semantic refinement directly from a decision node. */
export const refine: {
  <Input, D extends Decision.Any, S extends Schema.Constraint | undefined>(
    self: DecisionNode<Input, D, S>,
    predicate: (answer: Decision.Answer<D>) => boolean,
  ): Pattern<Input>
  <D extends Decision.Any>(
    predicate: (answer: Decision.Answer<D>) => boolean,
  ): <Input, S extends Schema.Constraint | undefined>(self: DecisionNode<Input, D, S>) => Pattern<Input>
} = dual(2, <Input, D extends Decision.Any, S extends Schema.Constraint | undefined>(
  self: DecisionNode<Input, D, S>,
  predicate: (answer: Decision.Answer<D>) => boolean,
): Pattern<Input> => self.where(predicate))

/** Build a tri-state semantic refinement directly from a decision node. */
export const refineResult: {
  <Input, D extends Decision.Any, S extends Schema.Constraint | undefined>(
    self: DecisionNode<Input, D, S>,
    resolve: (answer: Decision.Answer<D>) => PatternResult,
  ): Pattern<Input>
  <D extends Decision.Any>(
    resolve: (answer: Decision.Answer<D>) => PatternResult,
  ): <Input, S extends Schema.Constraint | undefined>(self: DecisionNode<Input, D, S>) => Pattern<Input>
} = dual(2, <Input, D extends Decision.Any, S extends Schema.Constraint | undefined>(
  self: DecisionNode<Input, D, S>,
  resolve: (answer: Decision.Answer<D>) => PatternResult,
): Pattern<Input> => self.whereResult(resolve))

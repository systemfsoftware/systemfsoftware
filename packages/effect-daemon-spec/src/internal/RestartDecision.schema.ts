import { Schema, SchemaAST, SchemaGetter } from 'effect'
import { MAX_CHILDREN_CEILING } from '../SupervisorDynamic.js'

/** @internal */
export const RestartStrategy = Schema.Literals(['one_for_one', 'one_for_all', 'rest_for_one'])
/** @internal */
export type RestartStrategy = typeof RestartStrategy.Type

/**
 * The cross-field invariant the command carries: a failed child's index addresses one of
 * the children that exist.
 *
 * It is a named function rather than an inline `Schema.filter` arrow because naming it makes
 * it reachable by this file's property block, which an inline arrow is not. It is not
 * exported: a `*.schema.ts` declares schemas and the vocabulary they are built from, never
 * loose functions, and nothing outside this module needs it.
 *
 * It lives here rather than beside the decision because the decision now imports
 * `DecideInput` as a *value* — `Workflow.make` constrains its command argument on the class
 * itself — so the dependency between these two modules has to run one way only. With the
 * predicate on the other side, both load orders reach a temporal dead zone: whichever module
 * evaluates first suspends on the other, and the name it needs at module scope is not yet
 * initialised.
 */
const failedIndexAddressesAChild = (input: {
  readonly failedIndex: number
  readonly totalChildren: number
}): boolean => input.failedIndex < input.totalChildren

/**
 * The message the cross-field filter reports. One binding, referenced by the filter and
 * by the law that asserts on it: a second copy would let the law pass against a message
 * the schema no longer produces, which is the whole failure the law exists to catch.
 */
const BOUND_MESSAGE = 'failedIndex must be < totalChildren'

type DecideInputFields = {
  readonly strategy: RestartStrategy
  readonly totalChildren: number
  readonly failedIndex: number
  readonly exitSuccess: boolean
  readonly intensityExceeded: boolean
}

/**
 * Constructive generation for the cross-field invariant. `failedIndexSeed` is independent
 * of `totalChildren` and always in `0 .. MAX-1`; the command's `failedIndex` is that seed
 * modulo `totalChildren`, so every generated sample satisfies `failedIndex < totalChildren`.
 *
 * `FilterConstraint` cannot express a relation between two fields. rc.116's constructor
 * for that case is `toCodecArbitrary`, not an empty `arbitraryConstraint`.
 */
const DecideInputGenerated = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING }))),
  failedIndexSeed: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MAX_CHILDREN_CEILING - 1 }))),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
})

const commandFromGenerated = (generated: typeof DecideInputGenerated.Type): DecideInputFields => ({
  strategy: generated.strategy,
  totalChildren: generated.totalChildren,
  failedIndex: generated.failedIndexSeed % generated.totalChildren,
  exitSuccess: generated.exitSuccess,
  intensityExceeded: generated.intensityExceeded,
})

const generatedFromCommand = (command: DecideInputFields) => ({
  strategy: command.strategy,
  totalChildren: command.totalChildren,
  failedIndexSeed: command.failedIndex,
  exitSuccess: command.exitSuccess,
  intensityExceeded: command.intensityExceeded,
})

const generatedLink = (): SchemaAST.Link =>
  Schema.link<DecideInputFields>()(DecideInputGenerated, {
    decode: SchemaGetter.transform(commandFromGenerated),
    encode: SchemaGetter.transform(generatedFromCommand),
  })

/**
 * The command's field map and cross-field check, named so the class below extends a binding
 * rather than an inline factory call. An anonymous base adds a new `ae-forgotten-export`
 * `*_base` warning to the committed API report, which this package fixes at the source
 * instead of suppressing.
 *
 * `failedIndex` is at most `MAX_CHILDREN_CEILING - 1` because it must be strictly less
 * than `totalChildren`, whose own maximum is the ceiling.
 *
 * The constructor hangs on the node as `toCodecArbitrary` *before* the check: a filter
 * cannot construct a cross-field sample, and `.pipe(Schema.check)` would hide the
 * annotation from the gate (the check receiver would be `Schema`, not this struct).
 */
const DecideInputBase = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING }))),
  failedIndex: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MAX_CHILDREN_CEILING - 1 }))),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
})
  .annotate({ toCodecArbitrary: generatedLink })
  .check(
    Schema.makeFilter(failedIndexAddressesAChild, {
      message: BOUND_MESSAGE,
    }),
  )

/**
 * The restart command. A `Schema.Class` rather than a `Schema.Struct` because `Workflow.make`
 * takes the command's class as its first argument, and a struct carries no `identifier` and
 * no `extend` — the constraint refuses it. Every field schema and the cross-field check are
 * the ones the struct carried.
 *
 * Class-level `toCodecArbitrary` is what `Arbitrary.schema(DecideInput)` compiles. The
 * self-reference is `Schema.suspend`, the same delay recursive schemas use: the thunk
 * runs at derivation time, after the class exists. The return type is `SchemaAST.Link`
 * so the heritage expression does not infer a cycle through `DecideInput`.
 */
/** @internal */
export class DecideInput extends Schema.Class<DecideInput>('DecideInput')(DecideInputBase, {
  toCodecArbitrary: (): SchemaAST.Link =>
    Schema.link<DecideInput>()(DecideInputGenerated, {
      decode: SchemaGetter.transform((generated) =>
        Schema.decodeSync(Schema.suspend(() => DecideInput))(commandFromGenerated(generated))
      ),
      encode: SchemaGetter.transform(generatedFromCommand),
    }),
}) {}

import { Schema } from 'effect'
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

/**
 * The command's field map and cross-field check, named so the class below extends a binding
 * rather than an inline factory call. An anonymous base adds a new `ae-forgotten-export`
 * `*_base` warning to the committed API report, which this package fixes at the source
 * instead of suppressing.
 */
const DecideInputBase = Schema.Struct({
  strategy: RestartStrategy,
  totalChildren: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX_CHILDREN_CEILING }))),
  failedIndex: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MAX_CHILDREN_CEILING }))),
  exitSuccess: Schema.Boolean,
  intensityExceeded: Schema.Boolean,
}).pipe(
  Schema.check(
    Schema.makeFilter(failedIndexAddressesAChild, {
      message: BOUND_MESSAGE,
      arbitrary: {
        candidate: {
          weight: 20,
          make: (fc) =>
            fc.integer({ min: 1, max: MAX_CHILDREN_CEILING }).chain((totalChildren) =>
              fc.record({
                strategy: fc.constantFrom('one_for_one', 'one_for_all', 'rest_for_one'),
                totalChildren: fc.constant(totalChildren),
                failedIndex: fc.integer({ min: 0, max: totalChildren - 1 }),
                exitSuccess: fc.boolean(),
                intensityExceeded: fc.boolean(),
              })
            ),
        },
      },
    }),
  ),
)

/**
 * The restart command. A `Schema.Class` rather than a `Schema.Struct` because `Workflow.make`
 * takes the command's class as its first argument, and a struct carries no `identifier` and
 * no `extend` — the constraint refuses it. Every field schema and the cross-field check are
 * the ones the struct carried.
 */
/** @internal */
export class DecideInput extends Schema.Class<DecideInput>('DecideInput')(DecideInputBase) {}

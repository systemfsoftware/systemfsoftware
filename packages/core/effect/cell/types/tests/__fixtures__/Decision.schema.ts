import * as S from 'effect/Schema'

/**
 * The decision fixtures the type tests pin the success-channel constraint against. They live in
 * a `*.schema.ts` because `schema-declaration-location` allows a module-scope schema declaration
 * only there or in the owning `<stem>.workflow.ts`, and because a `.tst.ts` may hold no runtime
 * value at all — the constraint is on the decision shape, so the assertions need real classes
 * with the family brand. Negative fixtures (divergent brands, untagged members) are `declare`d in
 * the type test itself.
 *
 * The family brand follows the repo's decision-brand idiom: a module-scope `Symbol.for` const and
 * a `readonly [T]` instance field on each variant class, so every variant of one decision union
 * carries the same TypeId.
 */

const DecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/Decision')
type DecisionTypeId = typeof DecisionTypeId

/** The canonical compliant shape: two `S.TaggedClass` variants sharing one family brand. */
export class DecisionOne extends S.TaggedClass<DecisionOne>()('DecisionOne', {
  value: S.Int,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class DecisionTwo extends S.TaggedClass<DecisionTwo>()('DecisionTwo', {
  reason: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export type Decision = DecisionOne | DecisionTwo

/** The tagged error channel `Inhabited` demands — tagged via the schema, never by hand. */
export class DecisionError extends S.TaggedError<DecisionError>()('DecisionError', {
  why: S.String,
}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class LoneDecision extends S.TaggedClass<LoneDecision>()('LoneDecision', {}) {
  readonly [DecisionTypeId] = DecisionTypeId
}

import { MESSAGE } from './path.config.js'

export const EFFECT_PREDICATE_NAME = 'an Effect-returning predicate passed to the synchronous `it.prop`' as const
export const EFFECT_PREDICATE_EXPECTED =
  '`it.effect.prop` (or `test.effect.prop`) when the predicate returns an Effect' as const
export const EFFECT_PREDICATE_ACTUAL =
  'a synchronous `it.prop`/`test.prop` whose predicate returns an Effect — `it.prop` judges the return value truthy/falsy, so the Effect never runs and the property passes vacuously' as const
export const EFFECT_PREDICATE_FIX =
  'change the callee to `it.effect.prop`; the predicate then runs and its boolean result is the verdict' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A predicate passed to the synchronous `it.prop`/`test.prop` from @effect/vitest that returns an Effect (`Effect.gen(...)`, any `Effect.<fn>(...)`, or a `.pipe(...)` chain rooted in an `Effect.` call) never runs: `it.prop` judges the return value truthy/falsy, so an Effect object passes vacuously. Effect-returning predicates must use `it.effect.prop`.',
  },
  schema: [],
  messages: {
    effectInSyncProp: MESSAGE,
  },
} as const

import { it } from '@effect/vitest'
import { Schema as S } from 'effect'

/**
 * Registers the refusal law for one schema: `rejected` generates values the schema's
 * contract forbids, and the property asserts every draw is refused. The generator states
 * the contract's complement, never a literal restated from the refinement under test.
 *
 * Hand-authored here because this package does not depend on the generated-laws stack;
 * `schema-laws.test.ts` is the taxonomy's sanctioned entry point for the pair.
 */
export const refusalLaws = (name: string, schema: S.Top, rejected: S.Top): void => {
  it.prop(`∀b_${name}_⊥`, [rejected], ([value]) => !S.is(schema)(value))
}

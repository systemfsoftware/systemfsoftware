import { it } from '@effect/vitest'
import type { FastCheck as fc } from 'effect/testing'

/**
 * The law's default comparison, named at module scope so the in-source block below can
 * exercise the exact predicate the published default uses. `Object.is` rather than `===`
 * because `NaN` is in the image of pure total functions over `S.Number`.
 */
const sameValue = <B>(left: B, right: B): boolean => Object.is(left, right)

/**
 * Property-test the determinism law of any function claimed to be pure.
 *
 * Registers one fast-check property with `@effect/vitest`:
 * `∀x. f(x) = f(x)` — two applications to the same input agree.
 *
 * Ambient nondeterminism breaks this wherever it sits in the call graph, including inside
 * a helper the function imports from another module. That is why this is a law and not a
 * lint rule: an AST rule resolves a called name against the file it is reading, and a run
 * resolves it against the program.
 *
 * What it does not catch: I/O whose result is constant — a write that returns the same
 * value every time. Repetition cannot observe that class; interaction observation can, and
 * this package does not do it. See PURE-L2.
 *
 * Equality defaults to `Object.is` rather than `===`, because `Schema.toArbitrary(S.Number)`
 * draws `NaN` — measured 3 times in 5000 samples — and `NaN === NaN` is `false`, so a
 * reference comparison reports a pure function as impure in roughly one run in sixteen at
 * the default `numRuns`.
 *
 * Use inside a `describe` block to scope the generated test.
 */
export const ruleOfPurity = <A, B>(
  name: string,
  fn: (a: A) => B,
  domain: fc.Arbitrary<A>,
  equals: (left: B, right: B) => boolean = sameValue,
): void => {
  it.prop(
    `∀x_${name}_=${name}`,
    [domain],
    ([input]) => equals(fn(input), fn(input)),
  )
}

/**
 * The determinism law for a function whose codomain is structural.
 *
 * A record, an `Either` or a `Chunk` is not reference-equal across two applications even
 * when the function is pure, so the default identity comparison would report a violation
 * that is not one. Pass the codomain's own equivalence — `Schema.equivalence`,
 * `Equal.equals`, or a hand-written one.
 */
export const ruleOfPurityBy = <A, B>(
  name: string,
  fn: (a: A) => B,
  domain: fc.Arbitrary<A>,
  equivalence: (left: B, right: B) => boolean,
): void => ruleOfPurity(name, fn, domain, equivalence)

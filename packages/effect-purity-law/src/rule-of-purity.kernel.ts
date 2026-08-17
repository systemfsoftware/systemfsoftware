/// <reference types="vitest/import-meta" />
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

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, expect, it } = await import('@effect/vitest')
  const { Schema: S } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')

  /** A genuinely pure total function: the law must hold over its whole domain. */
  const double = (n: number): number => n * 2

  /** Pure with a structural codomain: two applications build two objects. */
  const wrap = (n: number): { readonly value: number } => ({ value: n })

  // The domain is intentionally all JS numbers: `S.Number` accepts `NaN` (and `±Infinity`),
  // which is exactly why the law's default comparison is `Object.is` — see the kernel doc.
  // @effect-diagnostics-next-line schemaNumber:off
  const AnyNumber = S.Number
  const numbers = S.toArbitrary(AnyNumber)(fc)

  describe('ruleOfPurity', () => {
    ruleOfPurity('double', double, numbers)
    ruleOfPurityBy('wrap', wrap, numbers, (left, right) => Object.is(left.value, right.value))
  })

  /**
   * Ambient nondeterminism, deliberately a private counter beside the laws it breaks.
   *
   * The defect shape the law exists for: the counter's module is outside the analysed
   * surface (the guard keeps it out of the build), so no AST rule reading this file
   * sees the mutation. A counter rather than `Math.random()` so the witness is exact
   * instead of probabilistic.
   */
  let calls = 0
  const nextCall = (): number => {
    calls += 1
    return calls
  }

  /**
   * The defect shape the law exists for. `nextCall` is a private binding, so an AST rule
   * reading this module sees a local — and the run resolves it against the counter, which
   * is exactly the asymmetry: the rule can name the binding, the run observes the break.
   */
  const impureThroughImport = (n: number): number => n + nextCall()

  describe('the asymmetry the law exists for', () => {
    it('Should_ViolateDeterminism_When_ImpurityIsReachedThroughAnImport', () => {
      // Exact rather than probabilistic: the imported source counts its calls.
      expect(impureThroughImport(0)).not.toBe(impureThroughImport(0))
    })
  })
}

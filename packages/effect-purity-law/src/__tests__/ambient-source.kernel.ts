let calls = 0

/**
 * Ambient nondeterminism, deliberately in its own module.
 *
 * The defect shape the law exists for: a lint rule reading the *caller* resolves
 * `nextCall` against that file's own declarations, finds nothing, and reports nothing.
 * A counter rather than `Math.random()` so the witness is exact instead of probabilistic.
 */
export const nextCall = (): number => {
  calls += 1
  return calls
}

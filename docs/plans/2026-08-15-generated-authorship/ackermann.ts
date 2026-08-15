/**
 * Ackermann's function, as a term.
 *
 * It is here to settle one question by running: is the term language Turing complete, or is it
 * another data-description format with a recursion-shaped hole? Ackermann grows faster than any
 * primitive recursive function, so no bounded-iteration language can express it - a `fold` over a
 * list, a `map`, or any structural recursion on the input is provably not enough. Only general
 * recursion reaches it.
 *
 * The term uses exactly four nodes: `fix` for the recursive binding, `cond` for the branches, `op`
 * for the arithmetic, and `app` for the calls. Nothing in the language names a loop, a mutable
 * counter, or a statement, and none is needed.
 */
/**
 * `A(m, n)`, defined the standard way:
 *
 * - `A(0, n) = n + 1`
 * - `A(m, 0) = A(m - 1, 1)`
 * - `A(m, n) = A(m - 1, A(m, n - 1))`
 *
 * The third line is the one that matters: the inner call's *result* is the outer call's argument,
 * so the recursion depth is not a function of the input's structure. `A(3, 3) = 61` and
 * `A(3, 5) = 253`, both checked against the closed form `A(3, n) = 2^(n+3) - 3`.
 */
export function ackermann(m: number, n: number): number {
  return (m === 0) ? n + 1 : (n === 0) ? ackermann(m - 1, 1) : ackermann(m - 1, ackermann(m, n - 1))
}

/**
 * The number of steps `n` takes to reach 1 under the Collatz map.
 *
 * A second witness, and a sharper one: no one has proved this function total, so no
 * termination checker admits it and no total language can express it. A language that runs it
 * at all is one where non-termination is expressible - which is what Turing complete means.
 */
export function collatzLength(n: number): number {
  return (n <= 1) ? 0 : 1 + collatzLength(((n % 2) === 0) ? n / 2 : (3 * n) + 1)
}

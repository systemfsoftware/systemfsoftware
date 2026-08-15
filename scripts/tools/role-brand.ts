/**
 * The brand a role stamps on a cell program, and the compiler's precondition for compiling one.
 *
 * A role constructor is the only thing that decides which requirements a cell's terms may carry.
 * Without a precondition that decision is optional: the term language's own helpers build a program
 * directly, so an author who found a role's requirement set inconvenient could skip the constructor
 * and compile the cell anyway. Checking it in a guard would report that after the fact; checking it
 * in the compiler means no path exists from an unroled program to an emitted cell.
 *
 * It lives in its own module because both sides need it and neither can own it: the compiler refuses
 * without the brand, the role constructor applies it, and a value import in either direction closes
 * a cycle. The compiler's entry point ends in a top-level `await`, and it reaches a term file — and
 * so the role constructor — by dynamic import, so a cycle does not merely risk a stale binding: the
 * import graph deadlocks and the process exits on an unresolved promise. Nothing is imported here,
 * so nothing can close a cycle through it.
 *
 * Registry-keyed (`Symbol.for`) because the program is built in the term file's module realm and
 * checked in the compiler's.
 */
export const ROLE: unique symbol = Symbol.for('systemfsoftware.cell.role')

/**
 * The role that constructed a program, or `undefined` for one built by hand.
 *
 * Takes `unknown` because every caller has one: the compiler holds an unvalidated declaration, and
 * the gate holds the default export of a dynamic import.
 */
export const roleOf = (program: unknown): string | undefined => {
  if (typeof program !== 'object' || program === null) return undefined
  const brand: unknown = (program as Record<symbol, unknown>)[ROLE]
  return typeof brand === 'string' ? brand : undefined
}

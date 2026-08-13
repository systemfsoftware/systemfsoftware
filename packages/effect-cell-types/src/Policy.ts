import type { Effect } from 'effect/Effect'

// The policy cell's contract: a combinator that maps an effect to an effect,
// preserving A (the success type) and E (the error type) — and, per the
// verified signature, R (the requirements) as well. The preservation is
// structural: a combinator whose return changes A or rewrites E is rejected
// with TS2322, while the identity combinator is accepted — both observed
// against effect@3.22.1.
//
// No `make` is shipped: its parameter type would be exactly `Policy<A, E, R>`,
// so a constructor would be the identity function on the type, forcing nothing
// the type does not already force — the type itself is the enforcement. A
// nominal brand would add ceremony without force: a policy's contract is fully
// carried by its signature, and unlike the schema cell (whose value carries no
// cell identity and needs a brand to mint one) there is no hidden state for a
// gate to admit.
export type Policy<A, E, R> = (self: Effect<A, E, R>) => Effect<A, E, R>

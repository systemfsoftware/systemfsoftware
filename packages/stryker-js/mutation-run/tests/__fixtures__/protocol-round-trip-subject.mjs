/**
 * A minimal worker subject for the forked child-process proxy protocol round
 * trip (`tests/child-process-proxy-protocol.integration.test.ts`).
 *
 * The real subjects (e.g. `src/checker/checker-worker.ts`) declare
 * `static inject = tokens(...)` so typed-inject can resolve their constructor
 * dependencies; this fixture needs none, so the smallest valid equivalent is
 * an empty token list — typed-inject's `injectClass` reads
 * `injectable.inject || []` and constructs the class with zero arguments.
 *
 * Every member is receiver-dependent on purpose: the gate's whole point is
 * that a Call whose receiver is dropped (the `subjectMember(...args)` form of
 * `doCall`) cannot produce these answers — `this` would be `undefined` and the
 * first field access would throw. `stamp` is a plain data member so the
 * non-function branch of `doCall` (raw value pass-through) is exercised too.
 *
 * This file is deliberately plain ESM rather than TypeScript: the BUILT
 * worker entry is a plain node process, so the subject module it imports must
 * be natively importable.
 */
export class ProtocolRoundTripSubject {
  static inject = []

  constructor() {
    this.base = 40
    this.stamp = 'from-constructor'
  }

  /** `40 + x` — reads the constructor-set instance field through `this`. */
  add(x) {
    return this.base + x
  }

  /** Composes a second method through `this` — requires the receiver to survive. */
  describe() {
    return `${this.stamp}:${this.halve()}`
  }

  halve() {
    return this.base / 2
  }

  /**
   * Returns nothing, like the real subjects' `init` and `dispose`. A void
   * method's reply carries no result member at all, which is the shape a
   * hand-written `JSON.stringify` encode step drops while the decoder still
   * demands it.
   */
  touch() {
    this.touched = true
  }
}

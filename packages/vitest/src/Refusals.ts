/**
 * The refusal messages, published (R9): the run-time throw and the compile-time refusal carry the same string,
 * and each states the rewrite that replaces a refused form. The conformance suite asserts against these, so it
 * observes the contract a consumer imports rather than a file path inside the fork.
 *
 * @since 4.0.0
 */
export {
  narrowNegated,
  narrowVacuous,
  presenceMessage,
  refuseAsync,
  refuseBareEffect,
  refuseBoolean,
  refuseHook,
  refuseNoAssertion,
  refusePositionalProp,
  refuseUnprovided,
} from './internal/refusals.js'

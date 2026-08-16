import { Schema as S } from 'effect'
import { FastCheck } from 'effect/testing'

export const boundedUnion = <
  Base extends readonly [S.ConstraintCodec<unknown, unknown>, ...readonly S.ConstraintCodec<unknown, unknown>[]],
  Recur extends readonly [S.ConstraintCodec<unknown, unknown>, ...readonly S.ConstraintCodec<unknown, unknown>[]],
>(
  identifier: string,
  options: {
    readonly base: Base
    readonly recur: Recur
    readonly maxDepth?: number
  },
): S.Codec<
  Base[number]['Type'] | Recur[number]['Type'],
  Base[number]['Encoded'] | Recur[number]['Encoded']
> => {
  const { base, maxDepth = 2, recur } = options
  // The member arbitraries are derived inside the hook (not at construction):
  // a recursive union's members reference the union being built, so deriving
  // them eagerly would run the recursive thunks before the binding exists.
  // Deriving a recursive member re-enters this union's own arbitrary
  // derivation while it is still in flight — the guard folds that re-entry to
  // the finite base pair, so the single top-level derivation closes instead
  // of recursing forever. The recursion budget itself stays the classic
  // shared `depthIdentifier`/`maxDepth` oneof, which is what the depth law
  // measures.
  let deriving = false
  const hook: S.Annotations.ToArbitrary.Declaration<unknown, readonly []> = () =>
  (
    fc: typeof FastCheck,
    _context?: S.Annotations.ToArbitrary.Context,
  ): FastCheck.Arbitrary<unknown> | S.Annotations.ToArbitrary.Derivation<unknown> => {
    const baseArbitraries = fc.oneof(...base.map((member) => S.toArbitrary(member)(fc)))
    if (deriving) return baseArbitraries
    deriving = true
    try {
      const recurArbitraries = recur.map((member) => S.toArbitrary(member)(fc))
      return {
        arbitrary: fc.oneof(
          { depthIdentifier: identifier, maxDepth },
          baseArbitraries,
          ...recurArbitraries,
        ),
        terminal: baseArbitraries,
      }
    } finally {
      deriving = false
    }
  }
  return S.Union([...base, ...recur]).annotate({ identifier, toArbitrary: hook })
}

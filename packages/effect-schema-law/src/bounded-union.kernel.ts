import { Arbitrary, type FastCheck, Schema as S } from 'effect'

export const boundedUnion = <
  Base extends readonly [S.Schema.Any, ...ReadonlyArray<S.Schema.Any>],
  Recur extends readonly [S.Schema.Any, ...ReadonlyArray<S.Schema.Any>],
>(
  identifier: string,
  options: {
    readonly base: Base
    readonly recur: Recur
    readonly maxDepth?: number
  },
): S.Schema<
  S.Schema.Type<Base[number] | Recur[number]>,
  S.Schema.Encoded<Base[number] | Recur[number]>,
  S.Schema.Context<Base[number] | Recur[number]>
> => {
  const { base, maxDepth = 2, recur } = options
  const baseArbitraries = base.map((member) => Arbitrary.make(member))
  const recurArbitraries = recur.map((member) => Arbitrary.make(member))
  return S.Union(...base, ...recur).annotations({
    identifier,
    arbitrary: () => (fc: typeof FastCheck) =>
      fc.oneof(
        { depthIdentifier: identifier, maxDepth },
        fc.oneof(...baseArbitraries),
        ...recurArbitraries,
      ),
  })
}

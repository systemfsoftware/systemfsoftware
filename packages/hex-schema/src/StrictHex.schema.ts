import { Schema as S } from 'effect'

export const StrictHex = S.String.pipe(
  S.check(S.isPattern(/^[0-9a-f]*$/)),
  S.annotate({
    identifier: 'StrictHex',
    description: 'A lowercase hexadecimal string with no prefix',
    title: 'Strict Hex String',
  }),
)
export const HexBodyPairs = S.String.pipe(
  S.check(
    S.makeFilter((s) => /^(?:[0-9a-f]{2})+$/.test(s), {
      arbitrary: {
        candidate: {
          weight: 100,
          make: (fc) => fc.stringMatching(/^(?:[0-9a-f]{2})+$/),
        },
      },
    }),
  ),
)

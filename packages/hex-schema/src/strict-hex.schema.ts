import { Schema as S } from 'effect'

export const StrictHex = S.String.pipe(
  S.pattern(/^[0-9a-f]*$/),
  S.annotations({
    arbitrary: () => (fc) => fc.hexaString(),
    identifier: 'StrictHex',
    description: 'A lowercase hexadecimal string with no prefix',
    title: 'Strict Hex String',
  }),
)

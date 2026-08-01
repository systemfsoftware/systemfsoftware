import { Schema as S } from 'effect'

export const StrictHex = S.String.pipe(
  S.pattern(/^[0-9a-f]*$/),
  S.annotations({
    identifier: 'StrictHex',
    description: 'A lowercase hexadecimal string with no prefix',
    title: 'Strict Hex String',
  }),
)

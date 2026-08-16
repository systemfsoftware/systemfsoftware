import { Schema as S } from 'effect'

export const StrictHex = S.String.pipe(
  S.check(S.isPattern(/^[0-9a-f]*$/)),
  S.annotate({
    identifier: 'StrictHex',
    description: 'A lowercase hexadecimal string with no prefix',
    title: 'Strict Hex String',
  }),
)

import { pipe, Schema as S } from 'effect'

export const StrictHex = S.String.pipe(
  S.pattern(/^[0-9a-f]+$/),
  S.annotations({
    arbitrary: () => (fc) => fc.hexaString({ minLength: 1 }),
    identifier: 'StrictHex',
    description: 'A lowercase hexadecimal string with no prefix',
    title: 'Strict Hex String',
  }),
)
export type StrictHex = typeof StrictHex.Type

export const HexString = pipe(
  S.transform(
    S.String.pipe(
      S.pattern(/^(0x)?[0-9a-fA-F]+$/),
      S.annotations({ arbitrary: () => (fc) => fc.stringMatching(/^(0x)?[0-9a-fA-F]+$/) }),
    ),
    StrictHex,
    {
      decode: (hex) => (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase(),
      encode: (s) => s,
    },
  ),
  S.annotations({
    identifier: 'HexString',
    description: 'A string representing hexadecimal data, with or without the 0x prefix',
    examples: [
      'add119540287cfb4c427fe4a6efd6cc4473221f389249c3b5f36aec92009fc67',
      '27f7a181fd4996d061bbdc97be024bb8b764525e56748d1d7fdcb3e93f57b4a1',
    ] as const,
    title: 'Hex String',
  }),
  S.brand('HexString'),
)

export type HexString = S.Schema.Type<typeof HexString>

const hexToColon = (hex: string): string => (hex.match(/.{1,2}/g) ?? []).map((byte) => byte.toUpperCase()).join(':')

export const ColonHex = pipe(
  S.compose(
    S.transform(
      S.String.pipe(
        S.pattern(/^[0-9A-Fa-f]{1,2}(:[0-9A-Fa-f]{1,2})*$/),
        S.annotations({
          arbitrary: () => (fc) => fc.hexaString({ minLength: 1 }).map(hexToColon),
          examples: ['5A:A3:A6:D7', '7B:47:1D:1B'] as const,
        }),
      ),
      S.encodedSchema(HexString),
      { strict: true, decode: (colon) => colon.replaceAll(':', ''), encode: hexToColon },
    ),
    HexString,
  ),
  S.annotations({
    identifier: 'ColonHex',
    description: 'Colon-separated uppercase hex bytes — the fingerprint format developers expect',
    title: 'Colon-Separated Hex String',
  }),
)
export type ColonHex = typeof ColonHex.Type

/// <reference types="vitest/import-meta" />
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

const decode = S.decodeUnknownExit(StrictHex)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { Exit } = await import('effect')

  /**
   * `StrictHex` is the alphabet the rest of the package defers to — `PrefixedHex`
   * and `HexString` both state their body through it — and nothing exercised it
   * directly. The generated laws draw from its own arbitrary, so every value they
   * feed it is one it already accepts.
   *
   * Every draw is a non-empty even-length body, so a class narrowed to a single
   * character and a class negated outright each fail on every draw rather than on
   * a lucky one.
   */
  it.prop(
    '∀h_StrictHex_=x',
    [S.toArbitrary(HexBodyPairs)(fc)],
    ([hex]) => {
      const result = decode(hex)
      return Exit.isSuccess(result) && result.value === hex
    },
  )
}

/// <reference types="vitest/import-meta" />
import { type Brand, Schema as S, SchemaTransformation } from 'effect'
import { addHexPrefix, stripHexPrefix } from './PrefixedHex.js'
import { StrictHex } from './StrictHex.schema.js'

/** @public */
export const PrefixedHex = S.TemplateLiteral(['0x', S.String]).pipe(
  S.decodeTo(
    StrictHex,
    SchemaTransformation.transform({
      decode: stripHexPrefix,
      encode: addHexPrefix,
    }),
  ),
  S.annotate({
    identifier: 'PrefixedHex',
    description: 'A 0x-prefixed hex string on the wire — decodes to a plain lowercase hex string',
    title: 'Prefixed Hex String',
  }),
  S.brand('PrefixedHex'),
)
/** @public */
export type PrefixedHex = S.Schema.Type<typeof PrefixedHex>

const decode = S.decodeUnknownExit(PrefixedHex)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { Exit } = await import('effect')
  const { expectTypeOf } = await import('vitest')

  /**
   * The `0x` prefix is a *joint* contract with the body in v4's AST — no
   * weakening of `PrefixedHex` admits an unprefixed string, so an unprefixed
   * refusal generator can state the rejection half but never a discriminating
   * half. It is stated directly; the prefixed invalid-body draws below witness
   * the body obligation.
   */
  it.prop('∀b_PrefixedHexPrefix_⊥', [fc.stringMatching(/^[0-9a-f]+$/)], ([bare]) => !Exit.isSuccess(decode(bare)))

  /**
   * The reason the package exists: a consumer whose API demands `0x${string}`
   * passes `S.encodeSync` straight in. A false `expectTypeOf` is a `tsc` error,
   * which is the channel the mutation gate reads.
   */
  expectTypeOf<S.Codec.Encoded<typeof PrefixedHex>>().toEqualTypeOf<`0x${string}`>()

  expectTypeOf<S.Schema.Type<typeof PrefixedHex>>().toEqualTypeOf<string & Brand.Brand<'PrefixedHex'>>()
}

import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { CanonicalJson, KeyDigest } from './key.schema.js'

const sha256HexOf = (text: string): KeyDigest => KeyDigest.make(bytesToHex(sha256(utf8ToBytes(text))))

export const keyDigestOf = (canonical: CanonicalJson): KeyDigest => sha256HexOf(canonical)

export const agentContextDigestOf = (context: string): KeyDigest => sha256HexOf(context)

const hexOf = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

const webCryptoSha256Of = (text: string): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).pipe(Effect.map(hexOf))

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner.
  const { it } = await import('@systemfsoftware/vitest')

  it.effect.prop(
    '∀s_KeyDigest_≡WebCryptoSha256',
    { of: [Schema.String], subject: keyDigestOf, arbitrary: { seed: 498_009 } },
    (subject, [text]) =>
      Effect.map(webCryptoSha256Of(text), (expected) => subject(CanonicalJson.make(text)) === expected),
  )
}

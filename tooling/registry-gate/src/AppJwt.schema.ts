import { Match, Result, Schema } from 'effect'
import * as Base64 from 'effect/encoding/Base64'
import * as Base64Url from 'effect/encoding/Base64Url'

export const AppJwtClaims = Schema.Struct({ iat: Schema.Int, exp: Schema.Int, iss: Schema.String })
export type AppJwtClaims = typeof AppJwtClaims.Type

const clockSkewAllowanceSeconds = 60
const lifetimeSeconds = 540

export const AppJwtIssue = Schema.Struct({ appId: Schema.String, nowSeconds: Schema.Int })
export type AppJwtIssue = typeof AppJwtIssue.Type

export const appJwtClaimsOf = (issue: AppJwtIssue): AppJwtClaims => ({
  iat: issue.nowSeconds - clockSkewAllowanceSeconds,
  exp: issue.nowSeconds + lifetimeSeconds,
  iss: issue.appId,
})

const header = { alg: 'RS256', typ: 'JWT' } as const

export const signingInputOf = (claims: AppJwtClaims): string =>
  `${Base64Url.encode(JSON.stringify(header))}.${Base64Url.encode(JSON.stringify(claims))}`

export const Pkcs1Der = Schema.Uint8Array
export type Pkcs1Der = typeof Pkcs1Der.Type

const bigEndianBytesOf = (value: number): ReadonlyArray<number> =>
  Match.value(value).pipe(
    Match.when(0, (): ReadonlyArray<number> => []),
    Match.orElse((): ReadonlyArray<number> => [...bigEndianBytesOf(Math.floor(value / 256)), value % 256]),
  )

const derLengthOf = (length: number): ReadonlyArray<number> =>
  Match.value(length).pipe(
    Match.when((short) => short < 0x80, (short): ReadonlyArray<number> => [short]),
    Match.orElse((long): ReadonlyArray<number> => {
      const bytes = bigEndianBytesOf(long)
      return [0x80 + bytes.length, ...bytes]
    }),
  )

const derOf = (tag: number, content: Uint8Array): Uint8Array<ArrayBuffer> => {
  const prefix = [tag, ...derLengthOf(content.length)]
  const der = new Uint8Array(prefix.length + content.length)
  der.set(prefix)
  der.set(content, prefix.length)
  return der
}

const concatenated = (parts: ReadonlyArray<Uint8Array>): Uint8Array => {
  const whole = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  parts.reduce((offset, part) => {
    whole.set(part, offset)
    return offset + part.length
  }, 0)
  return whole
}

const pkcs8Version = Uint8Array.of(0x02, 0x01, 0x00)
const rsaEncryptionAlgorithm = Uint8Array.of(
  0x30,
  0x0d,
  0x06,
  0x09,
  0x2a,
  0x86,
  0x48,
  0x86,
  0xf7,
  0x0d,
  0x01,
  0x01,
  0x01,
  0x05,
  0x00,
)

export const pkcs8FromPkcs1 = (pkcs1: Pkcs1Der): Uint8Array<ArrayBuffer> =>
  derOf(0x30, concatenated([pkcs8Version, rsaEncryptionAlgorithm, derOf(0x04, pkcs1)]))

const pemBodyOf = (pem: string): string => pem.replace(/-----(?:BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '')

export const PrivateKeyPem = Schema.String.pipe(
  Schema.check(Schema.isPattern(/-----BEGIN (?:RSA )?PRIVATE KEY-----/)),
)
export type PrivateKeyPem = typeof PrivateKeyPem.Type

export const pkcs8DerOf = (pem: PrivateKeyPem): Result.Result<Uint8Array<ArrayBuffer>, string> =>
  Result.mapBoth(Base64.decode(pemBodyOf(pem)), {
    onFailure: () => 'the App private key is not a base64 PEM block',
    onSuccess: (der) =>
      Match.value(pem.includes('-----BEGIN RSA PRIVATE KEY-----')).pipe(
        Match.when(true, () => pkcs8FromPkcs1(der)),
        Match.orElse(() => Uint8Array.from(der)),
      ),
  })

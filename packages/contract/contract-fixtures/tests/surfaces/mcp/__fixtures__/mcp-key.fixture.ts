import { Result } from 'effect'
import { Base64Url } from 'effect/encoding'

export const CONFIRMATION_KEY_B64URL = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

const rawKey = (): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(Result.getOrThrow(Base64Url.decode(CONFIRMATION_KEY_B64URL)))

const hmacUsages: KeyUsage[] = ['sign', 'verify']

export const importConfirmationKey = (): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', rawKey(), { name: 'HMAC', hash: 'SHA-256' }, true, hmacUsages)

import { Array as Arr, Boolean as Bool, Crypto, Effect, Match, Option, type PlatformError } from 'effect'
import { Base64Url } from 'effect/encoding'
import { Contract } from '../../mod.js'

const textEncoder = new TextEncoder()

const trimmed = (value: string): string => value.trim()

export const etagOf = (
  encodedBody: string,
): Effect.Effect<string, PlatformError.PlatformError, Crypto.Crypto> =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto
    const digest = yield* crypto.digest('SHA-256', textEncoder.encode(encodedBody))
    return `"${Base64Url.encode(digest)}"`
  })

const cacheScopeOf = (exposure: Contract.Exposure): string =>
  Match.value(exposure).pipe(
    Match.tag('Public', () => 'public'),
    Match.tag('Restricted', () => 'private'),
    Match.exhaustive,
  )

export interface CacheDeclaration {
  readonly access: Contract.Access
  readonly exposure: Contract.Exposure
}

export const cacheControlOf = (declaration: CacheDeclaration): string =>
  Match.value(declaration.access).pipe(
    Match.tag('Read', (read) =>
      Match.value(read.cache).pipe(
        Match.tag('Revalidate', () => 'no-cache'),
        Match.tag('Fresh', (fresh) => `${cacheScopeOf(declaration.exposure)}, max-age=${fresh.maxAgeSeconds}`),
        Match.exhaustive,
      )),
    Match.tag('Write', () => 'no-store'),
    Match.tag('DurableWrite', () => 'no-store'),
    Match.exhaustive,
  )

export const cacheHeadersOf = (declaration: CacheDeclaration): Readonly<Record<string, string>> =>
  Match.value(declaration.exposure).pipe(
    Match.tag('Restricted', () => ({
      'cache-control': cacheControlOf(declaration),
      vary: 'Authorization',
    })),
    Match.tag('Public', () => ({ 'cache-control': cacheControlOf(declaration) })),
    Match.exhaustive,
  )

export interface ValidatorPredicate {
  readonly ifNoneMatch: string | undefined
  readonly etag: string
}

export const matchesEtag = (predicate: ValidatorPredicate): boolean =>
  Option.match(Option.fromUndefinedOr(predicate.ifNoneMatch), {
    onNone: () => false,
    onSome: (header) => {
      const candidates = Arr.map(header.split(','), trimmed)
      return Bool.some([Arr.contains(candidates, predicate.etag), Arr.contains(candidates, '*')])
    },
  })

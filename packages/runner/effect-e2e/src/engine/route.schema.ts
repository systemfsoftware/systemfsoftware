import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

export const Route = Schema.Struct({
  origin: Schema.String,
  path: Schema.String,
  query: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
})
export type Route = typeof Route.Type

export const NormalizedRoute = Schema.Struct({
  origin: Schema.String,
  segments: Schema.Array(Schema.String),
  query: Schema.Array(Schema.String),
})
export type NormalizedRoute = typeof NormalizedRoute.Type

// Ported from tester-army/e2e@72abdddd (npm `e2e` 0.21.2), packages/e2e/src/cache/route.ts, Apache-2.0.
const MINTED_SEGMENT_PATTERNS: ReadonlyArray<RegExp> = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
  /^[0-9a-f]{8,}$/iu,
  /^\d+$/u,
  /^(?=(?:[^\d]*\d){2})(?=.*[A-Za-z])[A-Za-z0-9_-]{12,}$/u,
  /^[A-Za-z]+-\d{2,}$/u,
  /\s/u,
]

const MINTED_QUERY_PATTERNS: ReadonlyArray<RegExp> = [
  ...MINTED_SEGMENT_PATTERNS,
  /^(?=(?:[^\d]*\d){2})(?=.*[A-Za-z])[\w.~+/=:-]{12,}$/u,
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u,
]

const PLACEHOLDER = ':id'

const isMinted = (patterns: ReadonlyArray<RegExp>, text: string): boolean =>
  text !== '' && patterns.some((pattern) => pattern.test(text))

const percentDecoded = Option.liftThrowable(decodeURIComponent)

const segmentTerm = (raw: string): string => {
  const text = Option.getOrElse(percentDecoded(raw), () => raw)
  return isMinted(MINTED_SEGMENT_PATTERNS, text) ? PLACEHOLDER : text
}

const queryTermPart = (text: string): string => (isMinted(MINTED_QUERY_PATTERNS, text) ? PLACEHOLDER : text)

const queryTerm = ([key, value]: readonly [string, string]): string => `${queryTermPart(key)}=${queryTermPart(value)}`

export const normalizeRoute = (route: Route): NormalizedRoute => ({
  origin: route.origin,
  segments: route.path.split('/').filter((raw) => raw !== '').map(segmentTerm),
  query: Arr.sort(route.query.map(queryTerm), Str.Order),
})

const identityOf = (route: NormalizedRoute): string => JSON.stringify([route.origin, route.segments, route.query])

export const sameRoute: {
  (live: Route): (recorded: Route) => boolean
  (recorded: Route, live: Route): boolean
} = Function.dual(
  2,
  (recorded: Route, live: Route): boolean => identityOf(normalizeRoute(recorded)) === identityOf(normalizeRoute(live)),
)

const routeAt = (location: string): Route => {
  const url = new URL(location, 'https://app.example.test')
  return { origin: url.origin, path: url.pathname, query: [...url.searchParams] }
}

const sameLocation = ([recorded, live]: readonly [string, string]): boolean =>
  sameRoute(routeAt(recorded), routeAt(live))

const upstreamAlikeLocations: ReadonlyArray<readonly [string, string]> = [
  ['/runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301', '/runs/8374a7a7-a64a-422d-9183-4350756c7f07'],
  ['/projects/a77c12665e90/tests', '/projects/0c1d2e3f4a5b/tests'],
  ['/orders/42', '/orders/7'],
  ['/blog/2024/09/18/launch-day', '/blog/2025/01/02/launch-day'],
  ['/keys/omk_7Qx9Lm2Pz4Rt8Wv1', '/keys/omk_1Ab2Cd3Ef4Gh5Ij'],
  ['/projects/PROJ-016', '/projects/PROJ-017'],
  ['/invoices/INV-2041', '/invoices/INV-87'],
  ['/companies', '/companies/'],
  ['/companies/Acme%20Corp', '/companies/42'],
  ['/companies?search=E2E+abc&page=2', '/companies?page=3&search=other+term'],
  ['/companies?tab=notes&sort=name', '/companies?sort=name&tab=notes'],
  [
    '/list?id=42&_=1727780000&token=eyJhbGciOiJIUzI1NiJ9.x1.y2&at=2026-10-01T10:00:00Z',
    '/list?id=7&_=1727780999&token=eyJhbGciOiJIUzI1NiJ9.a9.b8&at=2026-10-02T11:30:00Z',
  ],
  ['/tickets?open=INV-2041', '/tickets?open=INV-87'],
  ['/reports?from=2026-10-01&view=week', '/reports?from=2026-10-02&view=week'],
]

const upstreamDistinctLocations: ReadonlyArray<readonly [string, string]> = [
  ['/projects/integrations', '/projects/settings'],
  ['/api/v2/companies-v2/new', '/api/v3/companies-v2/new'],
  ['/en-US/settings/general', '/de-DE/settings/general'],
  ['/Products/Summer-Sneaker', '/Products/Winter-Boot'],
  ['/users/john_doe', '/users/jane_doe'],
  ['/news/page-2', '/news/page-3'],
  ['/tags/c++', '/tags/c'],
  ['/projects/new', '/projects/a77c12665e90'],
  ['/projects', '/projects/a77c12665e90'],
  ['/companies/Acme+Corp', '/companies/42'],
  ['/a%2Fb/c', '/a/b/c'],
  ['/task?mode=unsafe', '/task?mode=safe'],
  ['/companies?tab=notes', '/companies?tab=files'],
  ['/companies', '/companies?tab=notes'],
  ['/reports?from=2026-10-01&view=week', '/reports?from=2026-10-01&view=month'],
  ['http://127.0.0.1:4400/shop', 'http://localhost:4400/shop'],
]

const hexOf = (seed: number, width: number): string => Math.abs(seed).toString(16).padStart(width, '0')

const uuidOf = (seed: number): string => {
  const hex = hexOf(seed, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const twoDigits = (value: number): string => String(value).padStart(2, '0')

const timestampOf = (seed: number): string =>
  `2026-${twoDigits((Math.abs(seed) % 12) + 1)}-${twoDigits((Math.abs(seed) % 28) + 1)}T${
    twoDigits(Math.abs(seed) % 24)
  }:${twoDigits(Math.abs(seed) % 60)}:00Z`

const mintedIdLocations = (seed: number): ReadonlyArray<string> => [
  `/orders/${Math.abs(seed)}`,
  `/projects/${hexOf(seed, 12)}/tests`,
  `/runs/${uuidOf(seed)}`,
  `/invoices/INV-${(Math.abs(seed) % 9000) + 10}`,
  `/list?id=${Math.abs(seed)}&_=${Math.abs(seed)}`,
  `/reports?at=${timestampOf(seed)}&view=week`,
]

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

const sixLetterWordOf = (seed: number): string =>
  Arr.makeBy(6, (place) => LETTERS[Math.floor(Math.abs(seed) / 26 ** place) % 26]).join('')

const routeWordLocations = (word: string): ReadonlyArray<string> => [`/settings/${word}`, `/companies?tab=${word}`]

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀m_MintedId_≡SameRoute',
    { of: [Schema.Int, Schema.Int], subject: sameLocation, runs: 200, arbitrary: { seed: 496_001 } },
    (subject, [first, second]) =>
      Arr.every(upstreamAlikeLocations, subject) &&
      Arr.every(Arr.zip(mintedIdLocations(first), mintedIdLocations(second)), subject),
  )

  it.prop(
    '∀w_RouterWord_≡SameRouteIffSameWord',
    { of: [Schema.Int, Schema.Int], subject: sameLocation, runs: 200, arbitrary: { seed: 496_002 } },
    (subject, [first, second]) =>
      Arr.every(upstreamDistinctLocations, (pair) => !subject(pair)) &&
      Arr.every(
        Arr.zip(routeWordLocations(sixLetterWordOf(first)), routeWordLocations(sixLetterWordOf(second))),
        (pair) => subject(pair) === (sixLetterWordOf(first) === sixLetterWordOf(second)),
      ),
  )
}

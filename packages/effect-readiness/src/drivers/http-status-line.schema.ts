/// <reference types="vitest/importMeta" />
import { Effect, Option, Schema, SchemaGetter, SchemaIssue } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import { Responded } from '../DialEvidence.schema.js'

/**
 * The first line of an HTTP response, as the protocol writes it: `HTTP/<version> <code>`
 * with an optional reason phrase the domain does not keep. The grammar belongs to the
 * provider, so it lives in this adapter's schema file; the domain module holds no
 * status-line vocabulary.
 *
 * The Encoded side is the raw line, byte for byte. The Type side is the domain
 * {@link Responded}, whose `StatusCode` refuses a code outside 100-599. Encoding a
 * {@link Responded} yields a canonical line, so a decoded-then-encoded line need not
 * match the bytes the peer sent — the wire's version and reason phrase are dropped.
 */

const HTTP_VERSION_PREFIX = 'HTTP/'
const VERSION_CHARS = '0123456789.'
const DIGITS = '0123456789'
const CANONICAL_VERSION = '1.1'

const isCharOf = (alphabet: string, char: string): boolean => alphabet.includes(char)

const everyCharIn = (alphabet: string) => (text: string): boolean =>
  text.split('').every((char) => isCharOf(alphabet, char))

const versionOfToken = (token: string): string => token.slice(HTTP_VERSION_PREFIX.length)

const hasVersionChars = (token: string): boolean =>
  versionOfToken(token).length > 0 && everyCharIn(VERSION_CHARS)(versionOfToken(token))

const isVersionToken = (token: string): boolean => token.startsWith(HTTP_VERSION_PREFIX) && hasVersionChars(token)

const isCodeToken = (token: string): boolean => token.length === 3 && everyCharIn(DIGITS)(token)

const isStatusLinePair = ([version, code]: readonly [string, string]): boolean =>
  isVersionToken(version) && isCodeToken(code)

const versionAndCodeOf = (statusLine: string): Option.Option<readonly [string, string]> => {
  const [version, code] = statusLine.split(' ')
  return Option.all([Option.fromUndefinedOr(version), Option.fromUndefinedOr(code)])
}

const codeOfPair = ([, code]: readonly [string, string]): number => Number(code)

const codeOfStatusLine = (statusLine: string): Option.Option<number> =>
  versionAndCodeOf(statusLine).pipe(Option.filter(isStatusLinePair), Option.map(codeOfPair))

const statusLineForCode = (statusCode: number): string => `HTTP/${CANONICAL_VERSION} ${statusCode}`

const UNREADABLE_STATUS_LINE = 'an HTTP status line reads "HTTP/<version> <three-digit status code>"'

/** One raw status line decoded into the domain case the wait judges; an unreadable line fails decode. */
export const RespondedFromStatusLine = Schema.String.pipe(
  Schema.decodeTo(Responded, {
    decode: SchemaGetter.transformEffect((statusLine, options) =>
      Option.match(codeOfStatusLine(statusLine), {
        onNone: (): Effect.Effect<typeof Responded.Encoded, SchemaIssue.Issue> =>
          Effect.fail(new SchemaIssue.InvalidValue({ message: UNREADABLE_STATUS_LINE }, statusLine, options)),
        onSome: (statusCode): Effect.Effect<typeof Responded.Encoded, SchemaIssue.Issue> =>
          Effect.succeed({ _tag: 'Responded', statusCode }),
      })
    ),
    encode: SchemaGetter.transform((responded) => statusLineForCode(responded.statusCode)),
  }),
)
export type RespondedFromStatusLine = typeof RespondedFromStatusLine.Type

const STATUS_LINE_SEEDS: ReadonlyArray<string> = [
  'HTTP/1.0 200 OK',
  'HTTP/1.1 503 Service Unavailable',
  'HTTP/2 200',
  'HTTP/1.1 200',
  'HTTP/ 200 an empty version',
  'HTTP/1.1 099 Zero Padded',
  'HTTP/1.1 600 Too Large',
  '200 OK',
  'NOT_HTTP_MALFORMED_GARBAGE',
  '',
  'HTTP/1.1',
  'HTTP/1.1 2',
  'HTTP/1.1 20',
  'HTTP/1.1 2000 Too Long',
  '1.1 200 a status line without its scheme',
]

const withinStatusRange = (value: number): boolean => value >= 100 && value <= 599

// The oracle re-derives the status code from the line on its own terms: an independent
// reader the codec's own parsing never runs, so a defect in the codec shows as a
// disagreement rather than passing both sides through the same function.
const CONTRACT_VERSION_PREFIX = 'HTTP/'
const CONTRACT_VERSION_CHARS = '0123456789.'
const CONTRACT_CODE_CHARS = '0123456789'

const everyCharInAlphabet = (alphabet: string) => (text: string): boolean =>
  text.split('').every((char) => alphabet.includes(char))

const contractVersionBodyOf = (token: string): string => token.slice(CONTRACT_VERSION_PREFIX.length)

const hasContractVersionBody = (token: string): boolean =>
  contractVersionBodyOf(token).length > 0 &&
  everyCharInAlphabet(CONTRACT_VERSION_CHARS)(contractVersionBodyOf(token))

const contractVersionHolds = (token: string): boolean =>
  token.startsWith(CONTRACT_VERSION_PREFIX) && hasContractVersionBody(token)

const contractCodeHolds = (token: string): boolean =>
  token.length === 3 && everyCharInAlphabet(CONTRACT_CODE_CHARS)(token)

const contractPairHolds = ([version, code]: readonly [string, string]): boolean =>
  contractVersionHolds(version) && contractCodeHolds(code)

const contractPairOf = (statusLine: string): Option.Option<readonly [string, string]> => {
  const [version, code] = statusLine.split(' ')
  return Option.all([Option.fromUndefinedOr(version), Option.fromUndefinedOr(code)])
}

const codeOfContractPair = ([, code]: readonly [string, string]): number => Number(code)

const contractCodeOf = (statusLine: string): number | undefined =>
  contractPairOf(statusLine).pipe(
    Option.filter(contractPairHolds),
    Option.map(codeOfContractPair),
    Option.filter(withinStatusRange),
    Option.getOrUndefined,
  )

const wireRespondedOf = (statusLine: string): Result.Result<Responded, Schema.SchemaError> =>
  Schema.decodeResult(RespondedFromStatusLine)(statusLine)

const decodedStatusCodeOf = (statusLine: string): number | undefined =>
  Result.match(wireRespondedOf(statusLine), {
    onSuccess: (responded) => responded.statusCode,
    onFailure: () => undefined,
  })

const refusedNamingStatus = (statusLine: string): boolean =>
  Result.match(wireRespondedOf(statusLine), {
    onSuccess: () => false,
    onFailure: (error) => error.message.includes('HTTP status'),
  })

const refusesWithoutNamingStatus = (statusLine: string): boolean =>
  decodedStatusCodeOf(statusLine) === undefined && !refusedNamingStatus(statusLine)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static import
  // would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀l_RespondedRefusal_≡StatusLine',
    { of: [Schema.String], subject: decodedStatusCodeOf },
    (subject, [line]) =>
      Arr.every(
        Arr.append(STATUS_LINE_SEEDS, line),
        (candidate) => subject(candidate) === contractCodeOf(candidate) && !refusesWithoutNamingStatus(candidate),
      ),
  )
}

import { Effect, Option, Schema, SchemaGetter, SchemaIssue } from 'effect'
import { Responded } from './DialEvidence.schema.js'

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

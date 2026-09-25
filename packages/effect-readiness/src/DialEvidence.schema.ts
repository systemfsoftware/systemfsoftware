/// <reference types="vitest/importMeta" />
import { Effect, Option, Result, Schema, SchemaGetter, SchemaIssue } from 'effect'
import * as Arr from 'effect/Array'

export const StatusCode = Schema.Int.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 100, maximum: 599 },
      { message: 'an HTTP status code is an integer between 100 and 599' },
    ),
  ),
)
export type StatusCode = typeof StatusCode.Type

const HTTP_VERSION_PREFIX = 'HTTP/'
const VERSION_CHARS = '0123456789.'
const DIGITS = '0123456789'

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

const statusLineForCode = (statusCode: number): string => `HTTP/1.1 ${statusCode}`

const UNREADABLE_STATUS_LINE = 'an HTTP status line reads "HTTP/<version> <three-digit status code>"'

const DomainResponded = Schema.TaggedStruct('Responded', { statusCode: StatusCode })

export const Responded = Schema.TaggedStruct('Responded', { statusLine: Schema.String }).pipe(
  Schema.decodeTo(DomainResponded, {
    decode: SchemaGetter.transformEffect((wire, options) =>
      Option.match(codeOfStatusLine(wire.statusLine), {
        onNone: (): Effect.Effect<typeof DomainResponded.Encoded, SchemaIssue.Issue> =>
          Effect.fail(new SchemaIssue.InvalidValue({ message: UNREADABLE_STATUS_LINE }, wire, options)),
        onSome: (statusCode): Effect.Effect<typeof DomainResponded.Encoded, SchemaIssue.Issue> =>
          Effect.succeed({ _tag: 'Responded', statusCode }),
      })
    ),
    encode: SchemaGetter.transform((responded) => ({
      _tag: 'Responded',
      statusLine: statusLineForCode(responded.statusCode),
    })),
  }),
)
export type Responded = typeof Responded.Type

export const Connected = Schema.TaggedStruct('Connected', {})
export const Refused = Schema.TaggedStruct('Refused', {})
export const DialEvidence = Schema.Union([Connected, Refused])
export type DialEvidence = typeof DialEvidence.Type

export const HttpEvidence = Schema.Union([Responded, Refused])
export type HttpEvidence = typeof HttpEvidence.Type

const STATUS_CODE_SEEDS: ReadonlyArray<number> = [
  -1,
  0,
  99,
  100,
  599,
  600,
  1000,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]

const STATUS_LINE_SEEDS: ReadonlyArray<string> = [
  'HTTP/1.0 200 OK',
  'HTTP/1.1 503 Service Unavailable',
  'HTTP/1.1 200',
  'HTTP/ 200 an empty version',
  'HTTP/1.1 099 Zero Padded',
  'HTTP/1.1 600 Too Large',
  'NOT_HTTP_MALFORMED_GARBAGE',
  '',
  'HTTP/1.1',
  'HTTP/1.1 2',
  'HTTP/1.1 20',
  'HTTP/1.1 2000 Too Long',
  '1.1 200 a status line without its scheme',
]

const withinStatusRange = (value: number): boolean => value >= 100 && value <= 599

const isStatusCode = (value: number): boolean => Number.isInteger(value) && withinStatusRange(value)

const statusCodeDecodes = (value: number): boolean => Result.isSuccess(Schema.decodeResult(StatusCode)(value))

const wireRespondedOf = (statusLine: string): Result.Result<Responded, Schema.SchemaError> =>
  Schema.decodeResult(Responded)({ _tag: 'Responded', statusLine })

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

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so a static import
  // would enter the published module graph.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_StatusCodeRefusal_∈Bounds',
    { of: [Schema.Int], subject: statusCodeDecodes },
    (subject, [value]) =>
      Arr.every(
        Arr.append(STATUS_CODE_SEEDS, value),
        (candidate) => subject(candidate) === isStatusCode(candidate),
      ),
  )

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

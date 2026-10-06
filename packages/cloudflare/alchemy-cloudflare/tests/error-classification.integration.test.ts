import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Match } from 'effect'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import type * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as HttpClientResponseModule from 'effect/http/HttpClientResponse'

const Feature = makeFeature({ it })

const envelope = (code: number, message: string): string =>
  JSON.stringify({ success: false, errors: [{ code, message }] })

const respond = (
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponseModule.fromWeb(
    HttpClientRequest.get('http://127.0.0.1:1/'),
    new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } }),
  )

// The whole observable failure: tag, code and message on every variant, plus
// the retry duration only a throttled failure carries and the status only an
// unclassified failure carries.
const errorShape = (error: client.CloudflareError) =>
  Match.value(error).pipe(
    Match.tag('NotFound', (failure) => ({ _tag: 'NotFound', code: failure.code, message: failure.message })),
    Match.tag('AlreadyExists', (failure) => ({
      _tag: 'AlreadyExists',
      code: failure.code,
      message: failure.message,
    })),
    Match.tag('Validation', (failure) => ({ _tag: 'Validation', code: failure.code, message: failure.message })),
    Match.tag('RateLimited', (failure) => ({
      _tag: 'RateLimited',
      code: failure.code,
      message: failure.message,
      retryAfterSeconds: Duration.toSeconds(failure.retryAfter),
    })),
    Match.tag('Entitlement', (failure) => ({ _tag: 'Entitlement', code: failure.code, message: failure.message })),
    Match.tag('CloudflareApiError', (failure) => ({
      _tag: 'CloudflareApiError',
      status: failure.status,
      code: failure.code,
      message: failure.message,
    })),
    Match.exhaustive,
  )

// Expected values are hand-written from Cloudflare's envelope (`openapi/slice.json`
// statuses and codes; see the citations in src/client/errors.schema.ts).
const CASES = [
  {
    title: 'A throttled response reports the retry delay it was given',
    given: 'a 429 response carrying a five-second retry delay',
    response: respond(429, envelope(1000, 'rate limited'), { 'retry-after': '5' }),
    expected: { _tag: 'RateLimited', code: 1000, message: 'rate limited', retryAfterSeconds: 5 },
  },
  {
    title: 'A throttled response without a retry delay defaults to one second',
    given: 'a 429 response carrying no retry delay',
    response: respond(429, envelope(1000, 'rate limited')),
    expected: { _tag: 'RateLimited', code: 1000, message: 'rate limited', retryAfterSeconds: 1 },
  },
  {
    title: 'A throttled response with an unusable retry delay defaults to one second',
    given: 'a 429 response carrying the retry delay "soon"',
    response: respond(429, envelope(1000, 'rate limited'), { 'retry-after': 'soon' }),
    expected: { _tag: 'RateLimited', code: 1000, message: 'rate limited', retryAfterSeconds: 1 },
  },
  {
    title: 'A throttled response with a negative retry delay defaults to one second',
    given: 'a 429 response carrying the retry delay -2',
    response: respond(429, envelope(1000, 'rate limited'), { 'retry-after': '-2' }),
    expected: { _tag: 'RateLimited', code: 1000, message: 'rate limited', retryAfterSeconds: 1 },
  },
  {
    title: 'A 404 response is read as a missing resource',
    given: 'a 404 response whose envelope names the missing resource',
    response: respond(404, envelope(1003, 'namespace not found')),
    expected: { _tag: 'NotFound', code: 1003, message: 'namespace not found' },
  },
  {
    title: 'A 409 response is read as an already-existing resource',
    given: 'a 409 response whose envelope names the duplicate',
    response: respond(409, envelope(1003, 'namespace already exists')),
    expected: { _tag: 'AlreadyExists', code: 1003, message: 'namespace already exists' },
  },
  {
    title: 'A 400 response is read as a validation failure',
    given: 'a 400 response whose envelope names the invalid input',
    response: respond(400, envelope(6003, 'Invalid input.')),
    expected: { _tag: 'Validation', code: 6003, message: 'Invalid input.' },
  },
  {
    title: 'A 422 response is read as a validation failure',
    given: 'a 422 response whose envelope names the unprocessable input',
    response: respond(422, envelope(6003, 'Unprocessable Entity')),
    expected: { _tag: 'Validation', code: 6003, message: 'Unprocessable Entity' },
  },
  {
    title: 'An entitlement code is read as an entitlement failure',
    given: 'a 503 response whose envelope carries the entitlement code 10014',
    response: respond(503, envelope(10014, 'Not entitled to use feature: workers')),
    expected: { _tag: 'Entitlement', code: 10014, message: 'Not entitled to use feature: workers' },
  },
  {
    title: 'A failure with no decodable envelope reports its status',
    given: 'a 500 response whose body is not JSON',
    response: respond(500, 'upstream exploded', { 'content-type': 'text/plain' }),
    expected: { _tag: 'CloudflareApiError', status: 500, code: 0, message: 'HTTP 500' },
  },
  {
    title: 'A failure with a JSON body that is not an envelope reports its status',
    given: 'a 500 response whose body is a JSON array',
    response: respond(500, '[1,2,3]'),
    expected: { _tag: 'CloudflareApiError', status: 500, code: 0, message: 'HTTP 500' },
  },
  {
    title: 'A failure whose envelope carries no errors reports its status',
    given: 'a 500 response whose envelope has an empty error list',
    response: respond(500, '{"success":false,"errors":[]}'),
    expected: { _tag: 'CloudflareApiError', status: 500, code: 0, message: 'HTTP 500' },
  },
  {
    title: 'A failure whose envelope omits the error list reports its status',
    given: 'a 500 response whose envelope has no error list',
    response: respond(500, '{"success":false}'),
    expected: { _tag: 'CloudflareApiError', status: 500, code: 0, message: 'HTTP 500' },
  },
  {
    title: 'An unrecognised failure carries its status, code and message',
    given: 'a 500 response whose envelope names an unrecognised code',
    response: respond(500, envelope(9999, 'a toaster fell over')),
    expected: { _tag: 'CloudflareApiError', status: 500, code: 9999, message: 'a toaster fell over' },
  },
] as const

Feature('Turning a Cloudflare failure response into the typed error a resource branches on')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    for (const testCase of CASES) {
      scenario(
        testCase.title,
        Gherkin.Do.pipe(
          Given(testCase.given)('response', () => Effect.succeed(testCase.response)),
          When('the response is classified')(
            'failure',
            (s) => Effect.map(Effect.flip(client.classifyResponse(s.response)), errorShape),
          ),
          Then('the failure is the expected typed error')((s, expect) => expect(s.failure).toEqual(testCase.expected)),
        ),
      )
    }
  })

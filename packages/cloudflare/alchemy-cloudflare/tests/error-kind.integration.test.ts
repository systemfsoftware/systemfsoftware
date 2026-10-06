import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

const Feature = makeFeature({ it })

// Each expected kind is a hand-written literal over a hand-written signal; the
// code tables are cited in src/client/errors.schema.ts. `NOT_FOUND_CODES` and
// `VALIDATION_CODES` are empty, so their `Match.when` arms cannot be reached
// (reported as unreachable branches).
const CASES = [
  {
    title: 'A missing resource is read as not found',
    given: 'a failure the API answered with 404 and the code 1003',
    signal: client.CloudflareErrorSignal.make({
      status: 404,
      code: 1003,
      message: 'namespace not found',
      retryAfterSeconds: 1,
    }),
    kind: 'NotFound',
  },
  {
    title: 'A conflicting status outranks an entitlement code',
    given: 'a failure the API answered with 409 and the entitlement code 10014',
    signal: client.CloudflareErrorSignal.make({
      status: 409,
      code: 10014,
      message: 'namespace already exists',
      retryAfterSeconds: 1,
    }),
    kind: 'AlreadyExists',
  },
  {
    title: 'A throttled status outranks an entitlement message',
    given: 'a failure the API answered with 429 and the message "not entitled to use feature"',
    signal: client.CloudflareErrorSignal.make({
      status: 429,
      code: 0,
      message: 'Not entitled to use feature: workers',
      retryAfterSeconds: 1,
    }),
    kind: 'RateLimited',
  },
  {
    title: 'A duplicate-name code is read as already existing',
    given: 'a failure the API answered with 200 and the duplicate code 1003',
    signal: client.CloudflareErrorSignal.make({
      status: 200,
      code: 1003,
      message: 'namespace already exists',
      retryAfterSeconds: 1,
    }),
    kind: 'AlreadyExists',
  },
  {
    title: 'The entitlement code 10014 is read as an entitlement',
    given: 'a failure the API answered with 200 and the entitlement code 10014',
    signal: client.CloudflareErrorSignal.make({ status: 200, code: 10014, message: '', retryAfterSeconds: 1 }),
    kind: 'Entitlement',
  },
  {
    title: 'The entitlement code 10015 is read as an entitlement',
    given: 'a failure the API answered with 200 and the entitlement code 10015',
    signal: client.CloudflareErrorSignal.make({ status: 200, code: 10015, message: '', retryAfterSeconds: 1 }),
    kind: 'Entitlement',
  },
  {
    title: 'The entitlement code 10042 is read as an entitlement',
    given: 'a failure the API answered with 200 and the entitlement code 10042',
    signal: client.CloudflareErrorSignal.make({ status: 200, code: 10042, message: '', retryAfterSeconds: 1 }),
    kind: 'Entitlement',
  },
  {
    title: 'A bad-request status is read as a validation failure',
    given: 'a failure the API answered with 400 and the message "Invalid input."',
    signal: client.CloudflareErrorSignal.make({
      status: 400,
      code: 0,
      message: 'Invalid input.',
      retryAfterSeconds: 1,
    }),
    kind: 'Validation',
  },
  {
    title: 'An unprocessable status is read as a validation failure',
    given: 'a failure the API answered with 422',
    signal: client.CloudflareErrorSignal.make({ status: 422, code: 0, message: '', retryAfterSeconds: 1 }),
    kind: 'Validation',
  },
  {
    title: 'An entitlement message is read as an entitlement',
    given: 'a failure the API answered with 200 and the message "not entitled to use feature"',
    signal: client.CloudflareErrorSignal.make({
      status: 200,
      code: 0,
      message: 'Not entitled to use feature: workers',
      retryAfterSeconds: 1,
    }),
    kind: 'Entitlement',
  },
  {
    title: 'An unrecognised code is read as unknown',
    given: 'a failure the API answered with 500 and the unrecognised code 9999',
    signal: client.CloudflareErrorSignal.make({
      status: 500,
      code: 9999,
      message: 'a toaster fell over',
      retryAfterSeconds: 1,
    }),
    kind: 'Unknown',
  },
  {
    title: 'A bare failure with no code or message is read as unknown',
    given: 'a failure the API answered with 200 and no code or message',
    signal: client.CloudflareErrorSignal.make({ status: 200, code: 0, message: '', retryAfterSeconds: 1 }),
    kind: 'Unknown',
  },
] as const

Feature('Reading a Cloudflare failure back as the product error it names')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    for (const testCase of CASES) {
      scenario(
        testCase.title,
        Gherkin.Do.pipe(
          Given(testCase.given)('signal', () => Effect.succeed(testCase.signal)),
          When('the failure signal is classified')('kind', (s) => Effect.succeed(client.cloudflareErrorKind(s.signal))),
          Then('the failure is classified as the expected product error')((s, expect) =>
            expect(s.kind).toEqual(testCase.kind)
          ),
        ),
      )
    }
  })

import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as Result from 'effect/Result'

const Feature = makeFeature({ it })

// One case per decision arm in src/client/judge-cloudflare-error.workflow.ts.
const CASES = [
  {
    title: 'A missing resource is decided as not found',
    given: 'a failure signal a 404 answered',
    signal: client.CloudflareErrorSignal.make({
      status: 404,
      code: 1003,
      message: 'namespace not found',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'NotFoundOutcome', code: 1003, message: 'namespace not found' },
  },
  {
    title: 'A duplicate is decided as already existing',
    given: 'a failure signal a 409 answered',
    signal: client.CloudflareErrorSignal.make({
      status: 409,
      code: 1003,
      message: 'namespace already exists',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'AlreadyExistsOutcome', code: 1003, message: 'namespace already exists' },
  },
  {
    title: 'Invalid input is decided as a validation failure',
    given: 'a failure signal a 400 answered',
    signal: client.CloudflareErrorSignal.make({
      status: 400,
      code: 6003,
      message: 'Invalid input.',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'ValidationOutcome', code: 6003, message: 'Invalid input.' },
  },
  {
    title: 'A throttled failure is decided with its retry delay',
    given: 'a failure signal a 429 answered with a seven-second retry delay',
    signal: client.CloudflareErrorSignal.make({
      status: 429,
      code: 1000,
      message: 'rate limited',
      retryAfterSeconds: 7,
    }),
    expected: { _tag: 'RateLimitedOutcome', code: 1000, message: 'rate limited', retryAfterSeconds: 7 },
  },
  {
    title: 'An entitlement code is decided as an entitlement',
    given: 'a failure signal carrying the entitlement code 10014',
    signal: client.CloudflareErrorSignal.make({
      status: 200,
      code: 10014,
      message: 'Not entitled to use feature: workers',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'EntitlementOutcome', code: 10014, message: 'Not entitled to use feature: workers' },
  },
  {
    title: 'An unrecognised failure is decided as unclassified',
    given: 'a failure signal carrying an unrecognised code',
    signal: client.CloudflareErrorSignal.make({
      status: 500,
      code: 9999,
      message: 'a toaster fell over',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'UnclassifiedOutcome', status: 500, code: 9999, message: 'a toaster fell over' },
  },
] as const

Feature('Deciding the typed error for a Cloudflare failure signal')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    for (const testCase of CASES) {
      scenario(
        testCase.title,
        Gherkin.Do.pipe(
          Given(testCase.given)('signal', () => Effect.succeed(testCase.signal)),
          When('the failure signal is judged')(
            'verdict',
            (s) => Effect.succeed(Result.getOrThrow(client.judgeCloudflareError(s.signal))),
          ),
          Then('the verdict is the expected error outcome')((s, expect) =>
            expect(s.verdict).toEqual(expect.objectContaining(testCase.expected))
          ),
        ),
      )
    }
  })

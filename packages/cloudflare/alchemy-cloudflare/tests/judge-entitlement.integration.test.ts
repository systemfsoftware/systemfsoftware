import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as Result from 'effect/Result'

const Feature = makeFeature({ it })

// One case per decision arm in src/client/judge-entitlement.workflow.ts: only
// an entitlement signal pends access; every other signal leaves the caller entitled.
const CASES = [
  {
    title: 'An entitlement failure leaves access pending',
    given: 'a failure signal carrying the entitlement code 10014',
    signal: client.CloudflareErrorSignal.make({
      status: 200,
      code: 10014,
      message: 'Not entitled to use feature: workers',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'AccessPending', code: 10014, message: 'Not entitled to use feature: workers' },
  },
  {
    title: 'A missing resource leaves the caller entitled',
    given: 'a failure signal a 404 answered',
    signal: client.CloudflareErrorSignal.make({
      status: 404,
      code: 1003,
      message: 'namespace not found',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'Entitled' },
  },
  {
    title: 'A duplicate resource leaves the caller entitled',
    given: 'a failure signal a 409 answered',
    signal: client.CloudflareErrorSignal.make({
      status: 409,
      code: 1003,
      message: 'namespace already exists',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'Entitled' },
  },
  {
    title: 'Invalid input leaves the caller entitled',
    given: 'a failure signal a 400 answered',
    signal: client.CloudflareErrorSignal.make({
      status: 400,
      code: 6003,
      message: 'Invalid input.',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'Entitled' },
  },
  {
    title: 'A throttled failure leaves the caller entitled',
    given: 'a failure signal a 429 answered',
    signal: client.CloudflareErrorSignal.make({
      status: 429,
      code: 1000,
      message: 'rate limited',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'Entitled' },
  },
  {
    title: 'An unrecognised failure leaves the caller entitled',
    given: 'a failure signal carrying an unrecognised code',
    signal: client.CloudflareErrorSignal.make({
      status: 500,
      code: 9999,
      message: 'a toaster fell over',
      retryAfterSeconds: 1,
    }),
    expected: { _tag: 'Entitled' },
  },
] as const

Feature('Deciding whether a Cloudflare failure signal blocks a request on entitlement')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    for (const testCase of CASES) {
      scenario(
        testCase.title,
        Gherkin.Do.pipe(
          Given(testCase.given)('signal', () => Effect.succeed(testCase.signal)),
          When('the entitlement signal is judged')(
            'verdict',
            (s) => Effect.succeed(Result.getOrThrow(client.judgeEntitlement(s.signal))),
          ),
          Then('the verdict is the expected entitlement decision')((s, expect) =>
            expect(s.verdict).toEqual(expect.objectContaining(testCase.expected))
          ),
        ),
      )
    }
  })

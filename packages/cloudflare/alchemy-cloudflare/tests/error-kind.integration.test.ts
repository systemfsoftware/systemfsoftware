import { client } from '@systemfsoftware/alchemy-cloudflare'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const ZONE = 'fedcba9876543210fedcba9876543210'

const KV = `/accounts/${ACCOUNT}/storage/kv/namespaces`
const TELEMETRY = `/accounts/${ACCOUNT}/workers/observability/telemetry/query`
const DESTINATIONS = `/accounts/${ACCOUNT}/workers/observability/destinations`
const TRACING = `/zones/${ZONE}/observability/tracing/rules`
const SINKS = `/accounts/${ACCOUNT}/pipelines/v1/sinks`
const WORKER_SCRIPT = `/accounts/${ACCOUNT}/workers/scripts/my-worker`
const BASIN = `/accounts/${ACCOUNT}/basin-catalog/my-bucket`
const SPECTRUM = `/zones/${ZONE}/spectrum/apps`
const R2 = `/accounts/${ACCOUNT}/r2/buckets`

const signal = (
  path: string,
  status: number,
  code: number,
  message = '',
): client.CloudflareErrorSignal =>
  client.CloudflareErrorSignal.make({ path, status, code, message, retryAfterSeconds: 1 })

const CASES = [
  {
    title: 'A 404 status is a missing resource whatever the code claims',
    given: 'a KV failure answered 404 with the code 1003',
    signal: signal(KV, 404, 1003, 'namespace not found'),
    kind: 'NotFound',
  },
  {
    title: 'A 409 status outranks a code another product reads as an entitlement',
    given: 'a KV failure answered 409 with the code 10014',
    signal: signal(KV, 409, 10014, 'namespace already exists'),
    kind: 'AlreadyExists',
  },
  {
    title: 'A 429 status is a throttle whatever the message claims',
    given: 'a KV failure answered 429 with an entitlement message',
    signal: signal(KV, 429, 0, 'Not entitled to use feature: workers'),
    kind: 'RateLimited',
  },
  {
    title: 'A KV taken-title code is an already-existing namespace, not an entitlement',
    given: 'a KV failure answered 400 with the code 10014',
    signal: signal(KV, 400, 10014, 'namespace already exists'),
    kind: 'AlreadyExists',
  },
  {
    title: 'A pipelines sink duplicate code is an already-existing sink',
    given: 'a Pipelines failure answered 400 with the code 1003',
    signal: signal(SINKS, 400, 1003, 'sink already exists'),
    kind: 'AlreadyExists',
  },
  {
    title: 'A Workers entitlement code is an entitlement',
    given: 'a Workers scripts failure answered 200 with the code 10015',
    signal: signal(WORKER_SCRIPT, 200, 10015, ''),
    kind: 'Entitlement',
  },
  {
    title: 'A telemetry query 400/1003 is a validation failure, not an already-exists',
    given: 'a telemetry query answered 400 with the code 1003',
    signal: signal(TELEMETRY, 400, 1003, 'bad request'),
    kind: 'Validation',
  },
  {
    title: 'A zone tracing 400/1003 is a validation failure',
    given: 'a zone tracing failure answered 400 with the code 1003',
    signal: signal(TRACING, 400, 1003, 'bad request'),
    kind: 'Validation',
  },
  {
    title: 'An observability destination 400/1003 is a validation failure',
    given: 'a destination failure answered 400 with the code 1003',
    signal: signal(DESTINATIONS, 400, 1003, 'bad request'),
    kind: 'Validation',
  },
  {
    title: 'A Basin 10006 is a missing bucket',
    given: 'a Basin failure answered 400 with the code 10006',
    signal: signal(BASIN, 400, 10006, 'bucket not found'),
    kind: 'NotFound',
  },
  {
    title: 'A Spectrum 10006 is a missing application',
    given: 'a Spectrum failure answered 400 with the code 10006',
    signal: signal(SPECTRUM, 400, 10006, 'application not found'),
    kind: 'NotFound',
  },
  {
    title: 'An R2 10006 is a missing bucket',
    given: 'an R2 failure answered 400 with the code 10006',
    signal: signal(R2, 400, 10006, 'bucket not found'),
    kind: 'NotFound',
  },
  {
    title: 'A code absent from the telemetry family falls back to the 400 status class',
    given: 'a telemetry query answered 400 with the uncited code 9999',
    signal: signal(TELEMETRY, 400, 9999, 'a toaster fell over'),
    kind: 'Validation',
  },
  {
    title: 'A code absent from the KV family falls back to the 422 status class',
    given: 'a KV failure answered 422 with the uncited code 9999',
    signal: signal(KV, 422, 9999, 'unprocessable'),
    kind: 'Validation',
  },
  {
    title: 'A 403 whose body names an entitlement is an entitlement',
    given: 'a KV failure answered 403 with "Not entitled to use feature: workers"',
    signal: signal(KV, 403, 0, 'Not entitled to use feature: workers'),
    kind: 'Entitlement',
  },
  {
    title: 'A 403 whose body names no entitlement is unknown',
    given: 'a KV failure answered 403 with an uncited code and no message',
    signal: signal(KV, 403, 9999, ''),
    kind: 'Unknown',
  },
  {
    title: 'A code absent from the pipelines family still folds to the 400 status class',
    given: 'a Pipelines failure answered 400 with the uncited code 9999',
    signal: signal(SINKS, 400, 9999, 'bad request'),
    kind: 'Validation',
  },
  {
    title: 'An uncited 500 failure is unknown',
    given: 'a KV failure answered 500 with the uncited code 9999',
    signal: signal(KV, 500, 9999, 'a toaster fell over'),
    kind: 'Unknown',
  },
  {
    title: 'An empty failure is unknown',
    given: 'a KV failure answered 200 with no code or message',
    signal: signal(KV, 200, 0, ''),
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

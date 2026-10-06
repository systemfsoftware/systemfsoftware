import { captureCloudflare, CapturedResponse, CapturedResponses } from '@systemfsoftware/cloudflare-capture'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { ConfigProvider, Effect, Layer, Result, Schema } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { caseIdsOf, scriptCaptureRun } from './__fixtures__/capture-run-edge.fixture.js'
import { cloudflareEdge } from './__fixtures__/cloudflare-edge.fixture.js'

const Feature = makeFeature({ it })

const edge = await Effect.runPromise(cloudflareEdge)

const FAKE_ENV = {
  CLOUDFLARE_API_TOKEN: 'fake-token',
  CLOUDFLARE_ACCOUNT_ID: 'abcdef0123456789abcdef0123456789',
  CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
  GITHUB_RUN_ID: '7',
}

const captureLayer = Layer.mergeAll(
  FetchHttpClient.layer,
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: FAKE_ENV })),
)

Feature('Recording what the Cloudflare API answers for error cases no source documents')
  .live('a scripted Cloudflare edge on a real loopback socket')
  .withLayer(captureLayer)
  .body(({ scenario }) => {
    scenario(
      'A full run records each answer and renders the citational fixture',
      Gherkin.Do.pipe(
        Given(
          'a Cloudflare that answers every catalogued case',
        )('edge', () =>
          Effect.sync(() => {
            scriptCaptureRun({ edge })
            return edge
          })),
        When(
          'the capture lane runs against it',
        )('run', (s) => captureCloudflare(s.edge.baseUrl)),
        Then(
          'the fixture cites the not-found answer and holds ordered, id-free records',
        )((s, expect) =>
          expect({
            records: s.run.records,
            caseOrder: caseIdsOf(s.run.fixture),
            fixture: s.run.fixture,
          }).toSatisfy(
            (observed) =>
              observed.records.some(
                (record) =>
                  record.case === 'k2-stream-not-found' &&
                  record.product === 'k2Streams' &&
                  record.operation === 'getV4AccountsByAccount_idK2StreamsByStream_id' &&
                  record.method === 'GET' &&
                  record.endpoint === '/accounts/{account_id}/k2/streams/{stream_id}' &&
                  record.status === 404 &&
                  record.code === 1001 &&
                  record.message === 'K2 stream not found' &&
                  /^\d{4}-\d{2}-\d{2}$/.test(record.capturedOn),
              ) &&
              observed.caseOrder.join(',') === [...observed.caseOrder].sort().join(',') &&
              observed.fixture.startsWith(
                '[\n  {\n    "case": "basin-already-enabled",\n    "product": "basinCatalog",',
              ) &&
              !observed.fixture.includes('"id":') &&
              !observed.fixture.includes('stream-1'),
            'the fixture carries the cited answer, ordered by case, with no resource ids',
          )
        ),
      ),
    )
    scenario(
      'A record carrying a resource id or a concrete endpoint is refused',
      Gherkin.Do.pipe(
        Given(
          'a captured answer for a K2 stream not-found case',
        )('record', () =>
          Effect.succeed({
            case: 'k2-stream-not-found',
            product: 'k2Streams',
            operation: 'getV4AccountsByAccount_idK2StreamsByStream_id',
            method: 'GET',
            endpoint: '/accounts/{account_id}/k2/streams/{stream_id}',
            status: 404,
            code: 1001,
            message: 'K2 stream not found',
            capturedOn: '2026-10-06',
          })),
        When(
          'the answer is decoded once with a leaked id, once with a concrete endpoint, and once untouched',
        )('outcomes', (s) =>
          Effect.succeed({
            withId: Schema.decodeUnknownResult(CapturedResponse, { onExcessProperty: 'error' })({
              ...s.record,
              id: 'stream-1',
            }),
            concrete: Schema.decodeUnknownResult(CapturedResponse)({
              ...s.record,
              endpoint: '/accounts/abcdef0123456789abcdef0123456789/k2/streams/stream-1',
            }),
            untouched: Schema.decodeUnknownResult(CapturedResponses)([s.record]),
          })),
        Then(
          'the two polluted answers are refused and the untouched one decodes',
        )((s, expect) =>
          expect(s.outcomes).toSatisfy(
            (outcomes) =>
              Result.isFailure(outcomes.withId) &&
              Result.isFailure(outcomes.concrete) &&
              Result.isSuccess(outcomes.untouched),
            'the id and the concrete endpoint are refused, the untouched answer decodes',
          )
        ),
      ),
    )
  })

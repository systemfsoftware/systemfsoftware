import { registry } from '@systemfsoftware/contract-fixtures'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { HarnessShape } from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, Schema } from 'effect'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import { generateClient, generationLayer, loadGeneratedClient } from '../../__fixtures__/generated-client.fixture.js'
import { withHarness } from '../../__fixtures__/http-harness.fixture.js'
import {
  agrees,
  type CensusObservation,
  censusOf,
  directCensusClient,
  generatedCensus,
  samplesOf,
} from '../../__fixtures__/http-parity.fixture.js'
import { capabilitiesLayer } from '../../__fixtures__/http.fixture.js'

const Feature = makeFeature({ it })

const dispatched = (harness: HarnessShape, request: Request) =>
  Effect.gen(function*() {
    const body = yield* Effect.promise(() => request.arrayBuffer())
    const init = {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      ...(body.byteLength > 0 ? { body } : {}),
    }
    return yield* Effect.orDie(harness.dispatchFetch(request.url, init))
  })

const observations = withHarness((harness) =>
  Effect.gen(function*() {
    yield* generateClient
    const module = yield* Effect.promise(loadGeneratedClient)
    const baseClient = HttpClient.make((request) =>
      Effect.gen(function*() {
        const webRequest = yield* Effect.orDie(HttpClientRequest.toWeb(request))
        const response = yield* dispatched(harness, webRequest)
        const body = yield* Effect.promise(() => response.arrayBuffer())
        return HttpClientResponse.fromWeb(
          request,
          new Response(body, { status: response.status, headers: Object.fromEntries(response.headers.entries()) }),
        )
      })
    )
    const httpClient = HttpClient.mapRequest(baseClient, HttpClientRequest.prependUrl('http://harness'))
    const client = module.make(httpClient)
    const seed = { account: 'acct_00000000', cents: 12_500 }
    yield* censusOf({ contract: registry.transfer.contract, client: directCensusClient, sample: seed })
    yield* Effect.result(generatedCensus({ contract: registry.transfer.contract, client, sample: seed }))
    const collected: Array<CensusObservation> = []
    for (const capability of Object.values(registry)) {
      const contract = capability.contract
      for (const sample of samplesOf(contract)) {
        const direct = yield* censusOf({ contract, client: directCensusClient, sample })
        const generated = yield* Effect.result(generatedCensus({ contract, client, sample }))
        collected.push({ name: contract.name, sample, direct, generated })
      }
    }
    return collected
  })
)

const executeAttempt = withHarness((harness) =>
  Effect.gen(function*() {
    const body = yield* Effect.orDie(
      Schema.encodeEffect(Schema.fromJsonString(Schema.Json))({
        program: "return await fetch('https://example.com')",
        programId: 'http-execute',
        lifetime: { _tag: 'Request' },
      }),
    )
    const request = new Request('http://harness/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    const response = yield* dispatched(harness, request)
    const text = yield* Effect.promise(() => response.text())
    const answer = yield* Effect.orDie(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(text))
    return { status: response.status, body: answer }
  })
)

Feature('Reaching every capability over a real workerd HTTP Worker')
  .withScenarioLayer(Layer.mergeAll(generationLayer, capabilitiesLayer))
  .live('a real workerd runtime serves the mounted fixture Worker')
  .body(({ scenario }) => {
    scenario(
      'The generated client and the direct call answer the same census for every seeded sample',
      Gherkin.Do.pipe(
        When('the seeded samples are sent through the generated client to the running Worker')(
          'observed',
          () => observations,
        ),
        Then('no capability answers a different census')((scope, expect) =>
          expect(
            scope.observed
              .filter((entry) => !agrees(entry))
              .map((entry) => ({
                name: entry.name,
                sample: entry.sample,
                direct: entry.direct,
                generated: entry.generated,
              })),
          ).toEqual([])
        ),
      ),
    )

    scenario(
      'A program that fetches the open internet is refused at the sandbox edge',
      Gherkin.Do.pipe(
        When('an execute program that fetches example.com is posted to the running Worker')(
          'attempt',
          () => executeAttempt,
        ),
        Then('the Worker answers 422 with the typed egress denial, exactly as the command line does')(
          (scope, expect) =>
            expect({ status: scope.attempt.status, body: scope.attempt.body }).toEqual({
              status: 422,
              body: { _tag: 'SandboxEgressDenied', host: 'example.com' },
            }),
        ),
      ),
    )
  })

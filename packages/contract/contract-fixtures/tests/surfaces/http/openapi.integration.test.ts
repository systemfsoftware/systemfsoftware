import { hasSchema, registerSchema, validate } from '@hyperjump/json-schema/openapi-3-1'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Contract } from '@systemfsoftware/effect-contract'
import { mount } from '@systemfsoftware/effect-contract/http'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Equal, FileSystem, Layer, Result, Schema } from 'effect'
import { HttpRouter } from 'effect/http'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import { generateClient, generationLayer, loadGeneratedClient } from '../../__fixtures__/generated-client.fixture.js'
import { censusOf, directCensusClient, generatedCensus } from '../../__fixtures__/http-parity.fixture.js'
import { environment, fixtureRegistry } from '../../__fixtures__/http.fixture.js'
import { asJsonValue, decodeJsonText, type JsonValue } from '../../__fixtures__/json.fixture.js'

const Feature = makeFeature({ it })

const oasPinnedUri = 'https://spec.openapis.org/oas/3.1/schema/2022-10-07'
const pinnedSchemaPath = new URL('../../__fixtures__/schemas/oas-3.1.json', import.meta.url).pathname

const isJsonObject = (value: JsonValue): value is { [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const scenarioLayer = Layer.mergeAll(generationLayer, environment)

const healthyHandler = HttpRouter.toWebHandler(
  HttpRouter.provideRequest(environment)(mount(fixtureRegistry).layer),
).handler

const defectRegistry = {
  ...fixtureRegistry,
  ping: {
    contract: fixtureRegistry.ping.contract,
    cell: Cell.fromEffect(Effect.die(new Error('the fixture handler failed'))),
  },
}

const defectHandler = HttpRouter.toWebHandler(
  HttpRouter.provideRequest(environment)(mount(defectRegistry).layer),
).handler

const clientOf = (handler: (request: Request) => Promise<Response>): HttpClient.HttpClient =>
  HttpClient.mapRequest(
    HttpClient.make((request) =>
      Effect.gen(function*() {
        const webRequest = yield* Effect.orDie(HttpClientRequest.toWeb(request))
        const response = yield* Effect.promise(() => handler(webRequest))
        const body = yield* Effect.promise(() => response.arrayBuffer())
        return HttpClientResponse.fromWeb(
          request,
          new Response(body, { status: response.status, headers: response.headers }),
        )
      })
    ),
    HttpClientRequest.prependUrl('http://local'),
  )

const validatedDocument = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const pinnedText = yield* Effect.orDie(fs.readFileString(pinnedSchemaPath))
  const pinned = asJsonValue(yield* Effect.orDie(decodeJsonText(pinnedText)))
  if (isJsonObject(pinned) && !hasSchema(oasPinnedUri)) {
    registerSchema(pinned, oasPinnedUri)
  }
  const { documentJson } = yield* generateClient
  const document = asJsonValue(yield* Effect.orDie(decodeJsonText(documentJson)))
  const result = yield* Effect.promise(() => validate(oasPinnedUri, document, 'FLAG'))
  return { version: isJsonObject(document) ? document['openapi'] : undefined, valid: result.valid }
})

const completedCensus = (census: Result.Result<Schema.Json, Contract.Unavailable>): boolean =>
  Result.match(census, {
    onFailure: () => false,
    onSuccess: (value) => Schema.is(Schema.JsonObject)(value) && 'output' in value,
  })

const emptyInputCall = Effect.gen(function*() {
  yield* generateClient
  const module = yield* Effect.promise(loadGeneratedClient)
  const client = module.make(clientOf(healthyHandler))
  const contract = fixtureRegistry.ping.contract
  const direct = yield* censusOf({ contract, client: directCensusClient, sample: {} })
  const generated = yield* Effect.result(generatedCensus({ contract, client, sample: {} }))
  return { sameCensus: Equal.equals(direct, generated), completed: completedCensus(generated) }
})

const defectCall = Effect.gen(function*() {
  yield* generateClient
  const module = yield* Effect.promise(loadGeneratedClient)
  const client = module.make(clientOf(defectHandler))
  const ping = client['capabilitiesPing']
  if (ping === undefined) {
    return { status: 0, body: 'the generated client carries no ping method' }
  }
  const outcome = yield* Effect.result(ping({}))
  return yield* Result.match(outcome, {
    onFailure: (error) =>
      Effect.gen(function*() {
        const response = 'response' in error ? error.response : undefined
        const body = response === undefined ? '' : yield* Effect.orDie(response.text)
        return { status: response?.status ?? 0, body }
      }),
    onSuccess: () => Effect.succeed({ status: 0, body: 'the fixture answered a success the test did not expect' }),
  })
})

Feature('Adopting the HTTP surface through its published OpenAPI contract')
  .withScenarioLayer(scenarioLayer)
  .live('the OpenAPI generator emits the fixture client against the pinned schema')
  .body(({ scenario }) => {
    scenario(
      'The published document declares OpenAPI 3.1.0 and validates against the pinned schema',
      Gherkin.Do.pipe(
        When('the fixture document is emitted and validated against the pinned schema')(
          'observed',
          () => Effect.orDie(validatedDocument),
        ),
        Then('the document declares 3.1.0 and passes validation')((scope, expect) =>
          expect(scope.observed).toEqual({ version: '3.1.0', valid: true })
        ),
      ),
    )

    scenario(
      'The generated client calls an empty-input capability with an empty object and receives its answer',
      Gherkin.Do.pipe(
        When('the empty-input capability is called with an empty object')(
          'observed',
          () => Effect.orDie(emptyInputCall),
        ),
        Then('the generated client answers the same completed census as the direct call')((scope, expect) =>
          expect(scope.observed).toEqual({ sameCensus: true, completed: true })
        ),
      ),
    )

    scenario(
      'A capability whose handler fails answers a server error that leaks no body',
      Gherkin.Do.pipe(
        When('a capability whose handler fails is called')('observed', () => Effect.orDie(defectCall)),
        Then('the client sees a 500 with an empty body')((scope, expect) =>
          expect(scope.observed).toEqual({ status: 500, body: '' })
        ),
      ),
    )
  })

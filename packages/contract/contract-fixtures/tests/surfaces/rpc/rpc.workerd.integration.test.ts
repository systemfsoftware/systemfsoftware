import { fixtureLedgerLayer, type FixtureRequirement, registry } from '@systemfsoftware/contract-fixtures'
import type { Contract } from '@systemfsoftware/effect-contract'
import { client, type ContractRpc } from '@systemfsoftware/effect-contract/rpc'
import { directClient, type SurfaceClient } from '@systemfsoftware/effect-contract/testing'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { bundle, Harness, type HarnessOptions, type HarnessShape, layer } from '@systemfsoftware/effect-workerd-harness'
import { Effect, Equal, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import type { RpcClient, RpcClientError } from 'effect/rpc'
import { operationsEnvironment } from './__fixtures__/operations.fixture.js'
import { sampledInputs } from './__fixtures__/sampling.fixture.js'
import { anonymous, rpcCall, rpcCensus } from './__fixtures__/surface.fixture.js'

const Feature = makeFeature({ it })

const url = 'http://fixture/rpc'
const numRuns = 3

const environment = Layer.merge(operationsEnvironment, fixtureLedgerLayer)

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./__fixtures__/rpc.worker.ts', import.meta.url).pathname)),
)
const harnessOptions: HarnessOptions = { worker }

const bridge = (harness: HarnessShape): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.flatMap(Effect.orDie(HttpClientRequest.toWeb(request)), (web) =>
      Effect.flatMap(
        Effect.promise(() => web.text()),
        (body) =>
          harness.dispatchFetch(web.url, {
            method: web.method,
            headers: Object.fromEntries(web.headers),
            body,
          }),
      ).pipe(
        Effect.orDie,
        Effect.flatMap((remote) =>
          Effect.map(
            Effect.promise(() => remote.text()),
            (text) => new Response(text, { status: remote.status, headers: Object.fromEntries(remote.headers) }),
          )
        ),
        Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      ))
  )

type Outcome = { readonly ok: true; readonly census: Schema.Json } | { readonly ok: false; readonly reason: string }

const outcome = (effect: Effect.Effect<Schema.Json, Contract.Unavailable>): Effect.Effect<Outcome> =>
  Effect.match(effect, {
    onFailure: (error): Outcome => ({ ok: false, reason: error.reason }),
    onSuccess: (census): Outcome => ({ ok: true, census }),
  })

const compareAll = (
  rpc: RpcClient.RpcClient<ContractRpc, RpcClientError.RpcClientError>,
  direct: SurfaceClient<FixtureRequirement>,
): Effect.Effect<Array<Array<string>>> =>
  Effect.forEach(Object.entries(registry), ([name, capability]) =>
    Effect.forEach(
      sampledInputs({ input: capability.contract.input, count: numRuns, seed: 1 }),
      (input, index) =>
        Effect.gen(function*() {
          const reference = yield* outcome(
            Effect.provide(direct.call(name, { input, principal: anonymous }), environment),
          )
          const candidate = yield* outcome(
            rpcCensus(capability.contract, rpcCall({ rpc, name, invocation: { input, principal: anonymous } })),
          )
          return Equal.equals(reference, candidate) ? '' : `${name} sample ${index}`
        }),
    ))

Feature('The effect-contract RPC surface served in real workerd')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime answers every sampled input the way the direct call does')
  .body(({ scenario }) => {
    scenario(
      'the workerd RPC client and the direct call answer the same census for every sampled input',
      Gherkin.Do.pipe(
        When('every fixture capability is sampled and called through the workerd RPC client')(
          'mismatches',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const harness = yield* Harness
                const rpc = yield* client(registry, { url }).pipe(
                  Effect.provideService(HttpClient.HttpClient, bridge(harness)),
                )
                const direct = directClient({ registry, provide: environment })
                return yield* compareAll(rpc, direct)
              }).pipe(Effect.provide(layer(harnessOptions))),
            ),
        ),
        Then('no sampled input disagrees')((scope, expect) =>
          expect(scope.mismatches.flat().filter((entry) => entry !== '')).toEqual([])
        ),
      ),
    )
  })

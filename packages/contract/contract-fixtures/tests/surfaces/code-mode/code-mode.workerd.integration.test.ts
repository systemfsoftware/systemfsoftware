import { registry } from '@systemfsoftware/contract-fixtures'
import { execute } from '@systemfsoftware/effect-contract/code-mode'
import { client, type ContractRpc } from '@systemfsoftware/effect-contract/rpc'
import { directClient } from '@systemfsoftware/effect-contract/testing'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { bundle, Harness, type HarnessOptions, type HarnessShape, layer } from '@systemfsoftware/effect-workerd-harness'
import { Effect, Equal, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import * as Result from 'effect/Result'
import type { RpcClient, RpcClientError } from 'effect/rpc'
import { contractSandboxRegistry } from '../../__fixtures__/contract-sandbox.fixture.js'
import { capabilitiesLayer } from '../../__fixtures__/http.fixture.js'
import { sampledInputs } from '../rpc/__fixtures__/sampling.fixture.js'
import { anonymous, rpcCall, rpcCensus } from '../rpc/__fixtures__/surface.fixture.js'
import { CompletedCensus } from './__fixtures__/code-mode-parity.fixture.js'

const Feature = makeFeature({ it })

const url = 'http://fixture/rpc'
const numRuns = 3

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('../../__fixtures__/contract-sandbox.worker.ts', import.meta.url).pathname)),
)

const harnessOptions: HarnessOptions = { worker, bindings: [{ _tag: 'WorkerLoader', name: 'LOADER' }] }

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

const direct = directClient({ registry, provide: capabilitiesLayer })

const unavailableJson = (reason: string): Schema.Json => ({ _tag: 'Unavailable', reason })

const referenceOf = (name: string, sample: Schema.Json): Effect.Effect<Schema.Json> =>
  Effect.map(
    Effect.result(
      Effect.provide(direct.call(name, { input: sample, principal: anonymous }), capabilitiesLayer),
    ),
    Result.match({
      onFailure: (unavailable): Schema.Json => unavailableJson(unavailable.reason),
      onSuccess: (census): Schema.Json => census,
    }),
  )

const programInputOf = (name: string, sample: Schema.Json): Schema.Json => ({
  program: `return await tools.${name}(${JSON.stringify(sample)})`,
  programId: 'code-mode-parity',
  lifetime: { _tag: 'Request' },
})

const programAnswerOf = (census: Schema.Json, name: string): Schema.Json =>
  Option.getOrThrowWith(
    Option.map(Schema.decodeUnknownOption(CompletedCensus)(census), (completed) => completed.output),
    () => new Error(`execute did not answer Completed for a program calling ${name}`),
  )

const candidateOf = (
  rpc: RpcClient.RpcClient<ContractRpc, RpcClientError.RpcClientError>,
  name: string,
  sample: Schema.Json,
): Effect.Effect<Schema.Json> =>
  Effect.map(
    Effect.result(
      rpcCensus(
        execute,
        rpcCall({ rpc, name: 'execute', invocation: { input: programInputOf(name, sample), principal: anonymous } }),
      ),
    ),
    Result.match({
      onFailure: (unavailable): Schema.Json => unavailableJson(unavailable.reason),
      onSuccess: (census): Schema.Json => programAnswerOf(census, name),
    }),
  )

const compareAll = (
  rpc: RpcClient.RpcClient<ContractRpc, RpcClientError.RpcClientError>,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.map(
    Effect.forEach(Object.entries(registry), ([name, capability]) =>
      Effect.forEach(
        sampledInputs({ input: capability.contract.input, count: numRuns, seed: 1 }),
        (sample, index) =>
          Effect.gen(function*() {
            const reference = yield* referenceOf(name, sample)
            const candidate = yield* candidateOf(rpc, name, sample)
            return Equal.equals(reference, candidate) ? '' : `${name} sample ${index}`
          }),
      )),
    (rows) => rows.flat(),
  )

Feature('Running every fixture capability through a code-mode program in real workerd')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime runs each program through the sandbox host')
  .body(({ scenario }) => {
    scenario(
      'A program calling a capability answers the same census as the direct call for every sample',
      Gherkin.Do.pipe(
        When('every fixture capability is called through a code-mode program on the running Worker')(
          'mismatches',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const harness = yield* Harness
                const rpc = yield* client(contractSandboxRegistry, { url }).pipe(
                  Effect.provideService(HttpClient.HttpClient, bridge(harness)),
                )
                return yield* compareAll(rpc)
              }).pipe(Effect.provide(layer(harnessOptions))),
            ),
        ),
        Then('no sampled input disagrees')((scope, expect) =>
          expect(scope.mismatches.filter((entry) => entry !== '')).toEqual([])
        ),
      ),
    )
  })

import { type FixtureRequirement, registry } from '@systemfsoftware/contract-fixtures'
import { Differential } from '@systemfsoftware/differential-spec'
import { Contract } from '@systemfsoftware/effect-contract'
import { mount, toolAnnotationsOf, writeGuardPolicy } from '@systemfsoftware/effect-contract/mcp'
import { directClient, validInputs } from '@systemfsoftware/effect-contract/testing'
import { Effect, Equal, Match, Option, Result, Schema } from 'effect'
import * as fc from 'fast-check'
import { JsonText, textOf, UnavailableJson } from './__fixtures__/mcp-reply.fixture.js'
import { BEARER_TOKEN, endpoint, environment, person } from './__fixtures__/mcp.fixture.js'

const STATELESS = '2026-07-28'

const handler = mount(registry, {
  resourceUrl: endpoint,
  allowedOrigins: ['http://mcp.test'],
  provide: environment,
}).handler

type FixtureCapability = Contract.Capability<Contract.Any, FixtureRequirement>

interface SampledInput {
  readonly capability: FixtureCapability
  readonly input: Schema.Json
}

interface Sample {
  readonly capability: FixtureCapability
  readonly input: Schema.Json
  readonly capturedCensus: Result.Result<Schema.Json, Contract.Unavailable>
}

const readCapabilities: ReadonlyArray<FixtureCapability> = Object.values(registry).filter((capability) =>
  Schema.is(Contract.Read)(capability.contract.access)
)

const sampledInputs: ReadonlyArray<SampledInput> = readCapabilities.flatMap((capability) =>
  fc.sample(validInputs(capability.contract.input), { numRuns: 2, seed: 5 }).map((input) => ({ capability, input }))
)

const statelessMeta = {
  'io.modelcontextprotocol/protocolVersion': STATELESS,
  'io.modelcontextprotocol/clientCapabilities': {},
}

const requestOf = (name: string, input: Schema.Json): Effect.Effect<Request> =>
  Effect.map(
    Effect.orDie(
      Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: input, _meta: statelessMeta },
      }),
    ),
    (body) =>
      new Request(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': STATELESS,
          'mcp-method': 'tools/call',
          'mcp-name': name,
          authorization: `Bearer ${BEARER_TOKEN}`,
        },
        body,
      }),
  )

const dataLineOf = (text: string): string => {
  const line = text.split('\n').find((candidate) => candidate.startsWith('data: '))
  return line === undefined ? text : line.slice('data: '.length)
}

const mcpCensus = (sample: SampledInput): Effect.Effect<Schema.Json, Contract.Unavailable> =>
  Effect.gen(function*() {
    const request = yield* requestOf(sample.capability.contract.name, sample.input)
    const response = yield* Effect.promise(() => handler(request))
    const text = yield* Effect.promise(() => response.text())
    const reply = yield* Effect.orDie(Schema.decodeEffect(JsonText)(dataLineOf(text)))
    const census = yield* Effect.orDie(Schema.decodeEffect(JsonText)(textOf(reply)))
    const unavailable = Schema.decodeUnknownOption(UnavailableJson)(census)
    return yield* Option.isSome(unavailable)
      ? Effect.fail(new Contract.Unavailable({ reason: unavailable.value.reason }))
      : Effect.succeed(census)
  })

const directCensus = (sample: SampledInput): Effect.Effect<Schema.Json, Contract.Unavailable> =>
  Effect.provide(
    directClient({ registry, provide: environment }).call(sample.capability.contract.name, {
      input: sample.input,
      principal: person,
    }),
    environment,
  )

const capturedAnswers: ReadonlyArray<Result.Result<Schema.Json, Contract.Unavailable>> = await Effect.runPromise(
  Effect.forEach(sampledInputs, (sample) => Effect.result(mcpCensus(sample)), { concurrency: 1 }),
)

const samples: ReadonlyArray<Sample> = sampledInputs.map((sample, index) => ({
  ...sample,
  capturedCensus: capturedAnswers[index] ?? Result.fail(new Contract.Unavailable({ reason: 'missing sample' })),
}))

const surfaceCensus = (sample: Sample): Effect.Effect<Schema.Json, Contract.Unavailable> =>
  Result.match(sample.capturedCensus, {
    onFailure: (unavailable) => Effect.fail(unavailable),
    onSuccess: (census) => Effect.succeed(census),
  })

Differential.compare({
  name: 'every read capability answers the same census through the in-process MCP handler as the direct call',
  reference: directCensus,
  candidate: surfaceCensus,
})
  .on(fc.constantFrom(...samples), { runBudget: samples.length })
  .assert((expected, actual) => Equal.equals(expected, actual))

interface AnnotationProjection {
  readonly annotations: {
    readonly readOnlyHint: boolean
    readonly destructiveHint: boolean
    readonly idempotentHint: boolean
    readonly openWorldHint: boolean
  }
  readonly risk: string
  readonly requiresConfirmation: boolean
}

const modelPolicy = (access: Contract.Access) =>
  Match.value(access).pipe(
    Match.tag('Read', () => ({
      risk: 'Read',
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      requiresConfirmation: false,
    })),
    Match.tag('Write', ({ risk }) => ({
      risk,
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: risk === 'Critical',
      requiresConfirmation: true,
    })),
    Match.tag('DurableWrite', ({ risk }) => ({
      risk,
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: risk === 'Critical',
      requiresConfirmation: true,
    })),
    Match.exhaustive,
  )

const projectedByModel = (capability: FixtureCapability): Effect.Effect<AnnotationProjection> =>
  Effect.sync(() => {
    const policy = modelPolicy(capability.contract.access)
    return {
      annotations: {
        readOnlyHint: policy.readOnlyHint,
        destructiveHint: policy.destructiveHint,
        idempotentHint: policy.idempotentHint,
        openWorldHint: Schema.is(Contract.AllowList)(capability.contract.egress),
      },
      risk: policy.risk,
      requiresConfirmation: policy.requiresConfirmation,
    }
  })

const projectedBySurface = (capability: FixtureCapability): Effect.Effect<AnnotationProjection> =>
  Effect.sync(() => {
    const policy = writeGuardPolicy(capability.contract.access)
    return {
      annotations: toolAnnotationsOf(capability.contract.access, capability.contract.egress),
      risk: policy.risk,
      requiresConfirmation: policy.requiresConfirmation,
    }
  })

Differential.compare({
  name: 'every fixture capability projects the KTD10 annotations and exactly one risk level',
  reference: projectedByModel,
  candidate: projectedBySurface,
})
  .on(fc.constantFrom(...Object.values(registry)), { runBudget: Object.keys(registry).length })
  .assert((expected, actual) => Equal.equals(expected, actual))

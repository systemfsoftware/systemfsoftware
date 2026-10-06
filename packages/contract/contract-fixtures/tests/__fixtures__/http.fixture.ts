import { NodeCrypto } from '@effect/platform-node'
import { FixtureLedger, fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Contract, Operations } from '@systemfsoftware/effect-contract'
import { pathOf } from '@systemfsoftware/effect-contract/http'
import type { EncodedCensus, SurfaceClient } from '@systemfsoftware/effect-contract/testing'
import { operationsMemoryLayer } from '@systemfsoftware/effect-contract/testing'
import { Crypto, Effect, Layer, Option, Schema } from 'effect'

const HOST = 'http://contract.test'

export const cryptoLayer: Layer.Layer<Crypto.Crypto> = NodeCrypto.layer

export const operationsLayer: Layer.Layer<Operations.Operations> = operationsMemoryLayer.pipe(
  Layer.provide(cryptoLayer),
)

export const capabilitiesLayer: Layer.Layer<Operations.Operations | FixtureLedger> = Layer.merge(
  operationsLayer,
  fixtureLedgerLayer,
)

export const environment: Layer.Layer<Crypto.Crypto | Operations.Operations | FixtureLedger> = Layer.merge(
  capabilitiesLayer,
  cryptoLayer,
)

export const fixtureRegistry = registry

export interface FixtureCapability {
  readonly contract: Contract.Any
}

const index: Readonly<Record<string, FixtureCapability>> = { ...registry }

export const capabilityOf = (name: string): FixtureCapability =>
  Option.getOrThrowWith(
    Option.fromUndefinedOr(index[name]),
    () => new Error(`no fixture capability named ${name} is registered`),
  )

const asJson = (text: string): Option.Option<Schema.Json> =>
  Option.flatMap(
    Schema.decodeOption(Schema.fromJsonString(Schema.Unknown))(text),
    Schema.decodeUnknownOption(Schema.Json),
  )

const textOf = (value: Schema.Json): string => Schema.is(Schema.String)(value) ? value : JSON.stringify(value)

const valuesOf = (value: Schema.Json): ReadonlyArray<string> => [textOf(value)]

const fieldOf = (body: Schema.Json, field: string): Option.Option<Schema.Json> =>
  Schema.is(Schema.JsonObject)(body) ? Option.fromUndefinedOr(body[field]) : Option.none()

const queryOf = (contract: Contract.Any, input: Schema.Json): ReadonlyArray<readonly [string, string]> =>
  Object.keys(contract.input.fields).flatMap((field) =>
    Option.match(fieldOf(input, field), {
      onNone: (): ReadonlyArray<readonly [string, string]> => [],
      onSome: (value) => valuesOf(value).map((entry): readonly [string, string] => [field, entry]),
    })
  )

const urlOf = (path: string, query: ReadonlyArray<readonly [string, string]>): URL => {
  const url = new URL(path, HOST)
  query.forEach(([field, value]) => url.searchParams.append(field, value))
  return url
}

const requestOf = (contract: Contract.Any, input: Schema.Json): Request =>
  Schema.is(Contract.Read)(contract.access)
    ? new Request(urlOf(pathOf(contract.name), queryOf(contract, input)), { method: 'GET' })
    : new Request(new URL(pathOf(contract.name), HOST), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

const entry = (body: Schema.Json, field: string, fallback: Schema.Json): Schema.Json =>
  Option.getOrElse(fieldOf(body, field), () => fallback)

const statusCensus = (
  contract: Contract.Any,
  status: number,
  body: Schema.Json,
): Effect.Effect<EncodedCensus, Contract.Unavailable> =>
  Effect.suspend((): Effect.Effect<EncodedCensus, Contract.Unavailable> =>
    status === 200
      ? Effect.succeed({ _tag: 'Completed', output: entry(body, 'output', {}), next: entry(body, 'next', []) })
      : status === 202
      ? Effect.succeed({ _tag: 'Accepted', operation: entry(body, 'operation', ''), next: entry(body, 'next', []) })
      : status === 422
      ? Effect.succeed({ _tag: 'Refused', refusal: body, next: [] })
      : status === 400
      ? Effect.succeed({ _tag: 'Rejected', issue: entry(body, 'issue', '') })
      : status === 503
      ? Effect.flatMap(
        Effect.orDie(Schema.decodeEffect(Schema.toCodecJson(Contract.Unavailable))(body)),
        (unavailable) => Effect.fail(unavailable),
      )
      : Effect.die(new Error(`the http surface answered ${status} for ${contract.name}`))
  )

const censusOf = (
  contract: Contract.Any,
  response: Response,
): Effect.Effect<EncodedCensus, Contract.Unavailable> =>
  Effect.gen(function*() {
    const body = yield* Effect.promise(() => response.text())
    const parsed = Option.getOrElse(asJson(body), () => ({}))
    return yield* statusCensus(contract, response.status, parsed)
  })

export interface Transport {
  readonly fetch: (request: Request) => Effect.Effect<Response, never>
}

export const surfaceClientOf = (transport: Transport): SurfaceClient<never> => ({
  call: (name, invocation) =>
    Effect.gen(function*() {
      const capability = capabilityOf(name)
      const response = yield* transport.fetch(requestOf(capability.contract, invocation.input))
      return yield* censusOf(capability.contract, response)
    }),
})

export const webClientOf = (handler: (request: Request) => Promise<Response>): SurfaceClient<never> =>
  surfaceClientOf({ fetch: (request) => Effect.promise(() => handler(request)) })

export const urlClientOf = (fetch: (request: Request) => Promise<Response>): SurfaceClient<never> =>
  surfaceClientOf({ fetch: (request) => Effect.promise(() => fetch(request)) })

import { type FixtureRequirement, registry } from '@systemfsoftware/contract-fixtures'
import { Contract } from '@systemfsoftware/effect-contract'
import {
  directClient,
  type EncodedCensus,
  invalidEncodings,
  type SurfaceClient,
  validInputs,
} from '@systemfsoftware/effect-contract/testing'
import { Effect, Equal, Result, Schema } from 'effect'
import type * as HttpClientError from 'effect/http/HttpClientError'
import type { SchemaError } from 'effect/Schema'
import * as fc from 'fast-check'
import type { GeneratedClient, GeneratedClientError } from './generated-client.fixture.js'
import { capabilitiesLayer } from './http.fixture.js'

const isStringFieldObject = (sample: Schema.Json): boolean =>
  Schema.is(Schema.JsonObject)(sample) && Object.values(sample).every((value) => Schema.is(Schema.String)(value))

export const samplesOf = (contract: Contract.Any): ReadonlyArray<Schema.Json> => {
  const valid = fc.sample(validInputs(contract.input), { numRuns: 3, seed: 7 })
  const invalid = fc
    .sample(invalidEncodings(contract.input), { numRuns: 3, seed: 11 })
    .filter((sample) => !Schema.is(Contract.Read)(contract.access) || isStringFieldObject(sample))
  return [...valid, ...invalid]
}

export type CensusResult = Result.Result<EncodedCensus, Contract.Unavailable>

export interface CensusObservation {
  readonly name: string
  readonly sample: Schema.Json
  readonly direct: CensusResult
  readonly generated: CensusResult
}

export const agrees = (observation: CensusObservation): boolean =>
  Equal.equals(observation.direct, observation.generated)

interface CensusInput {
  readonly contract: Contract.Any
  readonly sample: Schema.Json
}

interface ClientCensusInput extends CensusInput {
  readonly client: GeneratedClient
}

interface DirectCensusInput extends CensusInput {
  readonly client: SurfaceClient<FixtureRequirement>
}

const methodOf = (name: string): string => `capabilities${name.charAt(0).toUpperCase()}${name.slice(1)}`

const completedCensus = (value: Schema.Json): EncodedCensus =>
  !Schema.is(Schema.JsonObject)(value)
    ? value
    : 'operation' in value
    ? { _tag: 'Accepted', operation: value['operation'] ?? '', next: value['next'] ?? [] }
    : { _tag: 'Completed', output: value['output'] ?? null, next: value['next'] ?? [] }

const refusedCensus = (cause: Schema.Json): EncodedCensus => ({ _tag: 'Refused', refusal: cause, next: [] })

const rejectedCensus = (cause: Schema.Json): EncodedCensus => ({
  _tag: 'Rejected',
  issue: Schema.is(Schema.JsonObject)(cause) ? cause['issue'] ?? '' : '',
})

type GeneratedFailure = GeneratedClientError | HttpClientError.HttpClientError | SchemaError

const isGeneratedClientError = (error: GeneratedFailure): error is GeneratedClientError =>
  error._tag.endsWith('400') || error._tag.endsWith('422') || error._tag.endsWith('503')

const generatedFailure = (
  name: string,
  error: GeneratedFailure,
): Effect.Effect<EncodedCensus, Contract.Unavailable> => {
  if (!isGeneratedClientError(error)) {
    const detail = 'response' in error && error.response !== undefined
      ? `#${error.response.status} ${error.response.request.url}`
      : 'reason' in error
      ? `reason=${error.reason?._tag} message=${error.message}`
      : ''
    return Effect.die(
      new Error(`the generated client answered outside a modelled status for ${name}: ${error._tag} ${detail}`),
    )
  }
  if (error._tag.endsWith('503')) {
    return Effect.flatMap(
      Effect.orDie(Schema.decodeEffect(Schema.toCodecJson(Contract.Unavailable))(error.cause)),
      (unavailable) => Effect.fail(unavailable),
    )
  }
  return Effect.succeed(error._tag.endsWith('422') ? refusedCensus(error.cause) : rejectedCensus(error.cause))
}

export const generatedCensus = (
  input: ClientCensusInput,
): Effect.Effect<EncodedCensus, Contract.Unavailable> =>
  Effect.gen(function*() {
    const method = input.client[methodOf(input.contract.name)]
    if (method === undefined) {
      return yield* Effect.die(new Error(`the generated client carries no ${methodOf(input.contract.name)} method`))
    }
    const outcome = yield* Effect.result(
      method(Schema.is(Contract.Read)(input.contract.access) ? { params: input.sample } : { payload: input.sample }),
    )
    return yield* Result.match(outcome, {
      onFailure: (error) => generatedFailure(input.contract.name, error),
      onSuccess: (value) => Effect.succeed(completedCensus(value)),
    })
  })

export const directCensusClient: SurfaceClient<FixtureRequirement> = directClient({
  registry,
  provide: capabilitiesLayer,
})

export const censusOf = (input: DirectCensusInput): Effect.Effect<CensusResult, never, FixtureRequirement> =>
  Effect.result(
    input.client.call(input.contract.name, {
      input: input.sample,
      principal: new Contract.Anonymous({}),
    }),
  )

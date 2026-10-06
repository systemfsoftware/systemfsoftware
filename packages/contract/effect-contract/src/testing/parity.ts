import { Differential } from '@systemfsoftware/differential-spec'
import type { DualExecutionSupervisorOptions, HostBound } from '@systemfsoftware/differential-spec'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Equal, Layer, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import * as fc from 'fast-check'
import type { Answer } from '../Answer/answer.schema.js'
import type { Unavailable } from '../Answer/unavailable.schema.js'
import type { Any, Invocation } from '../Contract/contract.js'
import { Anonymous } from '../Principal/principal.schema.js'
import { validInputs } from './arbitraries.js'

export type EncodedCensus = Schema.Json

export interface SurfaceClient<R = never> {
  readonly call: (name: string, invocation: Invocation) => Effect.Effect<EncodedCensus, Unavailable, R>
}

export interface SurfaceCapability<R = never> {
  readonly contract: Any
  readonly cell: Cell.Cell<Invocation, Answer, Unavailable, R>
}

export interface DirectClientOptions<R = never> {
  readonly registry: Readonly<Record<string, SurfaceCapability<R>>>
  readonly provide: Layer.Layer<R>
}

export interface ParityOptions<R = never> {
  readonly runBudget?: number | undefined
  readonly hostBound?: HostBound | undefined
  readonly provide: Layer.Layer<R>
}

export interface ParityCheck {
  readonly name: string
  readonly arbitrary: fc.Arbitrary<EncodedCensus>
  readonly comparison: Differential.Comparison<EncodedCensus, EncodedCensus, EncodedCensus, Unavailable>
}

const anonymous = new Anonymous({})

const asEncodedCensus = <A>(value: A): EncodedCensus =>
  Option.getOrThrowWith(
    Schema.decodeUnknownOption(Schema.Json)(value),
    () => new Error('a capability census encoded to a value outside Schema.Json'),
  )

const encodeCensus = (contract: Any, answer: Answer): Effect.Effect<EncodedCensus, never> =>
  Effect.map(Effect.orDie(Schema.encodeEffect(Schema.toCodecJson(contract.answer))(answer)), asEncodedCensus)

const capabilityOf = <R>(
  registry: Readonly<Record<string, SurfaceCapability<R>>>,
  name: string,
): SurfaceCapability<R> =>
  Option.getOrThrowWith(
    Option.fromUndefinedOr(registry[name]),
    () => new Error(`no capability named ${name} is registered`),
  )

export const directClient = <R>(options: DirectClientOptions<R>): SurfaceClient<R> => ({
  call: (name, invocation) =>
    Effect.provide(
      Effect.flatMap(
        capabilityOf(options.registry, name).cell.run(invocation),
        (answer) => encodeCensus(capabilityOf(options.registry, name).contract, answer),
      ),
      options.provide,
    ),
})

const directCensus = <R>(
  capability: SurfaceCapability<R>,
  input: EncodedCensus,
): Effect.Effect<EncodedCensus, Unavailable, R> =>
  Effect.flatMap(
    capability.cell.run({ input, principal: anonymous }),
    (answer) => encodeCensus(capability.contract, answer),
  )

const surfaceCensus = <R>(
  client: SurfaceClient<R>,
  contract: Any,
  input: EncodedCensus,
): Effect.Effect<EncodedCensus, Unavailable, R> =>
  Effect.flatMap(
    client.call(contract.name, { input, principal: anonymous }),
    (raw) =>
      Effect.flatMap(
        Effect.orDie(Schema.decodeEffect(Schema.toCodecJson(contract.answer))(raw)),
        (answer) => encodeCensus(contract, answer),
      ),
  )

const budgetOf = <R>(options: ParityOptions<R>): DualExecutionSupervisorOptions =>
  options.runBudget === undefined ? {} : { runBudget: options.runBudget }

const hostBoundOf = <R>(options: ParityOptions<R>): DualExecutionSupervisorOptions =>
  options.hostBound === undefined ? {} : { hostBound: options.hostBound }

const supervisionOf = <R>(options: ParityOptions<R>): DualExecutionSupervisorOptions => ({
  ...budgetOf(options),
  ...hostBoundOf(options),
})

const sameCensus = (expected: EncodedCensus, actual: EncodedCensus): boolean => Equal.equals(expected, actual)

const parityChecksImpl = <R>(
  registry: Readonly<Record<string, SurfaceCapability<R>>>,
  client: SurfaceClient<R>,
  options: ParityOptions<R>,
): ReadonlyArray<ParityCheck> =>
  Object.entries(registry).map(([key, capability]): ParityCheck => ({
    name: key,
    arbitrary: validInputs(capability.contract.input),
    comparison: {
      name: `${key} encodes the census its direct call answers`,
      reference: (input) => Effect.provide(directCensus(capability, input), options.provide),
      candidate: (input) => Effect.provide(surfaceCensus(client, capability.contract, input), options.provide),
    },
  }))

export const parityChecks: {
  <R>(
    registry: Readonly<Record<string, SurfaceCapability<R>>>,
    client: SurfaceClient<R>,
    options: ParityOptions<R>,
  ): ReadonlyArray<ParityCheck>
  <R>(
    client: SurfaceClient<R>,
    options: ParityOptions<R>,
  ): (registry: Readonly<Record<string, SurfaceCapability<R>>>) => ReadonlyArray<ParityCheck>
} = dual(3, parityChecksImpl)

const parityImpl = <R>(
  registry: Readonly<Record<string, SurfaceCapability<R>>>,
  client: SurfaceClient<R>,
  options: ParityOptions<R>,
): void => {
  for (const check of parityChecksImpl(registry, client, options)) {
    Differential.compare(check.comparison).on(check.arbitrary, supervisionOf(options)).assert(sameCensus)
  }
}

export const parity: {
  <R>(
    registry: Readonly<Record<string, SurfaceCapability<R>>>,
    client: SurfaceClient<R>,
    options: ParityOptions<R>,
  ): void
  <R>(client: SurfaceClient<R>, options: ParityOptions<R>): (
    registry: Readonly<Record<string, SurfaceCapability<R>>>,
  ) => void
} = dual(3, parityImpl)

import * as Effect from 'effect/Effect'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import type * as Schema from 'effect/Schema'
import type { HandlerResult } from './pattern.resource.js'
import { region } from './region.service.js'
import type { RouteOptions } from './Route.schema.js'
import { isEffectOf } from './run-policy.cell.js'
import type { RouteUncertain } from './select-route.workflow.js'

const ProcedureTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Procedure')
type ProcedureTypeId = typeof ProcedureTypeId

/**
 * A named, typed, semantically routable Effect program.
 *
 * A procedure is a named entry point with a described purpose and a typed
 * input; a registry chooses between several of them from one request. The
 * description is the text a registry routes on, and {@link Procedure.examples}
 * sharpen it when the description alone is too coarse.
 */
export interface Procedure<
  Id extends string,
  Input,
  Output,
  Error,
  Requirements,
  InputSchema extends Schema.Constraint,
> extends Pipeable {
  readonly [ProcedureTypeId]: ProcedureTypeId
  readonly id: Id
  readonly description: string
  readonly examples: ReadonlyArray<string>
  readonly input: InputSchema
  readonly eligible: (input: Input) => boolean
  readonly run: (input: Input) => Effect.Effect<Output, Error, Requirements>
}

export type Any = Procedure<string, never, Top, Top, Top, Schema.Constraint>

type Top<A = unknown> = A

export type IdOf<C> = C extends { readonly id: infer Id extends string } ? Id : never

type RunOf<C> = C extends { readonly run: (...args: never[]) => infer Run } ? Run : never

export type OutputOf<C> = Effect.Success<RunOf<C>>
export type ErrorOf<C> = Effect.Error<RunOf<C>>
export type RequirementsOf<C> = Effect.Services<RunOf<C>>

export const examplesOrNone = (examples: ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
  examples === undefined ? [] : examples

const eligibleOrAlways = <Input>(eligible: ((input: Input) => boolean) | undefined): (input: Input) => boolean =>
  eligible === undefined ? () => true : eligible

export const make = <const Id extends string, S extends Schema.Constraint, Out, Err, Req>(options: {
  readonly id: Id
  readonly description: string
  readonly examples?: ReadonlyArray<string>
  readonly input: S
  readonly eligible?: (input: S['Type']) => boolean
  readonly run: (input: S['Type']) => Effect.Effect<Out, Err, Req>
}): Procedure<Id, S['Type'], Out, Err, Req, S> => ({
  [ProcedureTypeId]: ProcedureTypeId,
  id: options.id,
  description: options.description,
  examples: examplesOrNone(options.examples),
  input: options.input,
  eligible: eligibleOrAlways(options.eligible),
  run: (input) => region(options.id)(Effect.suspend(() => options.run(input))),
  ...Prototype,
})

export const fromEffect = <const Id extends string, S extends Schema.Constraint, Out, Err, Req>(
  id: Id,
  description: string,
  input: S,
  run: (input: S['Type']) => Effect.Effect<Out, Err, Req>,
): Procedure<Id, S['Type'], Out, Err, Req, S> => make({ id, description, input, run })

export interface InvokeOptions<
  Input,
  FallbackValue = never,
  FallbackError = never,
  FallbackServices = never,
> {
  readonly routing?: RouteOptions | undefined
  readonly onUncertain?: (
    input: Input,
    route: (typeof RouteUncertain)['Encoded'],
  ) => HandlerResult<FallbackValue, FallbackError, FallbackServices>
}

export interface FallbackInvokeOptions<
  Input,
  FallbackValue,
  FallbackError = never,
  FallbackServices = never,
> {
  readonly routing?: RouteOptions | undefined
  readonly onUncertain: (
    input: Input,
    route: (typeof RouteUncertain)['Encoded'],
  ) => HandlerResult<FallbackValue, FallbackError, FallbackServices>
}

export interface FallbackInvocation<Input, FallbackValue, FallbackError = never, FallbackServices = never> {
  readonly input: Input
  readonly options: FallbackInvokeOptions<Input, FallbackValue, FallbackError, FallbackServices>
}

export const handlerEffectOf = <Value, Err, Req>(
  value: HandlerResult<Value, Err, Req>,
): Effect.Effect<Value, Err, Req> => (isEffectOf(value) ? value : Effect.succeed(value))

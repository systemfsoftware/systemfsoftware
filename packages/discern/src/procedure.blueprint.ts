import * as Effect from 'effect/Effect'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import type * as Schema from 'effect/Schema'
import type { HandlerResult } from './pattern.blueprint.js'
import type { RouteOptions } from './Route.schema.js'
import { isEffectOf } from './run-policy.cell.js'
import type { RouteUncertain } from './select-route.workflow.js'

const ProcedureTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Procedure')
type ProcedureTypeId = typeof ProcedureTypeId

/**
 * A typed, semantically routable Effect program.
 *
 * A procedure is a named entry point with a described purpose and a typed
 * input; a registry chooses between several of them from one request. The
 * description is the text a registry routes on, and {@link Procedure.examples}
 * sharpen it when the description alone is too coarse. The name lives with the
 * registry that holds it, as the record's key, so a procedure and its id can
 * never disagree.
 */
export interface Procedure<
  Input,
  Output,
  Error,
  Requirements,
  InputSchema extends Schema.Constraint,
> extends Pipeable {
  readonly [ProcedureTypeId]: ProcedureTypeId
  readonly description: string
  readonly examples: ReadonlyArray<string>
  readonly input: InputSchema
  readonly eligible: (input: Input) => boolean
  readonly run: (input: Input) => Effect.Effect<Output, Error, Requirements>
}

export type AnyProcedure<
  Input = never,
  Output = unknown,
  Failure = unknown,
  Requirements = unknown,
  InputSchema extends Schema.Constraint = Schema.Constraint,
> = Procedure<Input, Output, Failure, Requirements, InputSchema>

export type HomogeneousProcedure<
  Input,
  InputSchema extends Schema.Constraint,
  Output = unknown,
  Failure = unknown,
  Requirements = unknown,
> = Procedure<Input, Output, Failure, Requirements, InputSchema>

export type Any = AnyProcedure

type RunOf<C> = C extends { readonly run: (...args: never[]) => infer Run } ? Run : never

export type OutputOf<C> = Effect.Success<RunOf<C>>
export type ErrorOf<C> = Effect.Error<RunOf<C>>
export type RequirementsOf<C> = Effect.Services<RunOf<C>>

export const examplesOrNone = (examples: ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
  examples === undefined ? [] : examples

const eligibleOrAlways = <Input>(eligible: ((input: Input) => boolean) | undefined): (input: Input) => boolean =>
  eligible === undefined ? () => true : eligible

export const make = <S extends Schema.Constraint, Out, Err, Req>(options: {
  readonly description: string
  readonly examples?: ReadonlyArray<string>
  readonly input: S
  readonly eligible?: (input: S['Type']) => boolean
  readonly run: (input: S['Type']) => Effect.Effect<Out, Err, Req>
}): Procedure<S['Type'], Out, Err, Req, S> => ({
  [ProcedureTypeId]: ProcedureTypeId,
  description: options.description,
  examples: examplesOrNone(options.examples),
  input: options.input,
  eligible: eligibleOrAlways(options.eligible),
  run: (input) => Effect.suspend(() => options.run(input)),
  ...Prototype,
})

export const fromEffect = <S extends Schema.Constraint, Out, Err, Req>(options: {
  readonly description: string
  readonly input: S
  readonly run: (input: S['Type']) => Effect.Effect<Out, Err, Req>
}): Procedure<S['Type'], Out, Err, Req, S> => make(options)

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

/**
 * Procedures: a named, semantically routable Effect program.
 *
 * A procedure is a named entry point with a described purpose and a typed
 * input; a registry chooses between several of them from one request. The
 * description is the text a registry routes on, and {@link Procedure.examples}
 * sharpen it when the description alone is too coarse. The name lives with the
 * registry that holds it, as the record's key, so a procedure and its id can
 * never disagree.
 *
 * A procedure is a cold blueprint with no configuration step. Everything the
 * rest of the package reads (`description`, `examples`, `input`, `eligible`,
 * `run`) is a target, and its type index holds the typed fields themselves, so
 * {@link OutputOf}, {@link ErrorOf} and {@link RequirementsOf} read the same
 * shape they always did.
 */
import { Blueprint } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'
import type { HandlerResult } from './pattern.blueprint.js'
import type { RouteOptions } from './Route.schema.js'
import { isEffectOf } from './run-policy.cell.js'
import type { RouteUncertain } from './select-route.workflow.js'

type Top<A = unknown> = A

export const TypeId = Symbol.for('@systemfsoftware/discern/Procedure')
export type TypeId = typeof TypeId

export interface ProcedureSpec {
  readonly description: string
  readonly examples: ReadonlyArray<string>
  readonly input: Schema.Constraint
  readonly eligible: (input: never) => boolean
  readonly run: (input: never) => Effect.Effect<Top, Top, Top>
}

export interface ProcedureIndex {
  readonly Eligible: Top
  readonly Run: Top
  readonly InputSchema: Top
}

export interface ProcedureFields<Input, Output, Error, Requirements, InputSchema extends Schema.Constraint> {
  readonly Eligible: (input: Input) => boolean
  readonly Run: (input: Input) => Effect.Effect<Output, Error, Requirements>
  readonly InputSchema: InputSchema
}

type FieldOf<X, K extends keyof ProcedureIndex> = (X & ProcedureIndex)[K]

export interface ProcedureDescription extends Blueprint.Target {
  readonly target: string
}

/** The requests that sharpen {@link ProcedureDescription} when it is too coarse. */
export interface ProcedureExamples extends Blueprint.Target {
  readonly target: ReadonlyArray<string>
}

export interface ProcedureInput extends Blueprint.Target {
  readonly target: FieldOf<this['Index'], 'InputSchema'>
}

export interface ProcedureEligible extends Blueprint.Target {
  readonly target: FieldOf<this['Index'], 'Eligible'>
}

export interface ProcedureRun extends Blueprint.Target {
  readonly target: FieldOf<this['Index'], 'Run'>
}

export interface ProcedureOps {
  readonly description: ProcedureDescription
  readonly examples: ProcedureExamples
  readonly input: ProcedureInput
  readonly eligible: ProcedureEligible
  readonly run: ProcedureRun
}

export type Procedure<
  Input,
  Output,
  Error,
  Requirements,
  InputSchema extends Schema.Constraint,
> = Blueprint.Blueprint<
  typeof TypeId,
  ProcedureSpec,
  ProcedureOps,
  ProcedureFields<Input, Output, Error, Requirements, InputSchema>
>

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

const Procedures = Blueprint.make<ProcedureSpec, ProcedureIndex>()(TypeId).operations<ProcedureOps>()({
  operations: {},
  targets: {
    description: (self: AnyProcedure) => self.spec.description,
    examples: (self: AnyProcedure) => self.spec.examples,
    input: (self: AnyProcedure) => self.spec.input,
    eligible: (self: AnyProcedure) => self.spec.eligible,
    run: (self: AnyProcedure) => self.spec.run,
  },
})

export const make = <S extends Schema.Constraint, Out, Err, Req>(options: {
  readonly description: string
  readonly examples?: ReadonlyArray<string>
  readonly input: S
  readonly eligible?: (input: S['Type']) => boolean
  readonly run: (input: S['Type']) => Effect.Effect<Out, Err, Req>
}): Procedure<S['Type'], Out, Err, Req, S> =>
  Procedures.of<ProcedureFields<S['Type'], Out, Err, Req, S>>({
    description: options.description,
    examples: examplesOrNone(options.examples),
    input: options.input,
    eligible: eligibleOrAlways(options.eligible),
    run: (input) => Effect.suspend(() => options.run(input)),
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

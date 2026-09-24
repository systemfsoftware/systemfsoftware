import type * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'
import type * as Schema from 'effect/Schema'
import type * as Scope from 'effect/Scope'

import type { AnyRootDefinition } from './Handle.js'

export type { Handle } from './Handle.js'

type Top<A = unknown> = A

export const ResourceTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Resource')
export type ResourceTypeId = typeof ResourceTypeId

export const KindTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Resource/Kind')
export type KindTypeId = typeof KindTypeId

export interface Brand<Spec> {
  readonly witness?: (spec: Spec) => Spec
}

export interface Resource<Spec, H, E, R, Provided, ProvideE, ProvideR> extends Pipeable {
  readonly [ResourceTypeId]: Brand<Spec>
  readonly spec: Spec
  readonly scoped: Effect.Effect<H, E, R | Scope.Scope>
  readonly layer: Layer.Layer<Provided, E | ProvideE, Exclude<R | ProvideR, Scope.Scope>>
  readonly bind: <Id>(key: Context.Key<Id, H>) => Layer.Layer<Id, E, Exclude<R, Scope.Scope>>
}

export interface Kind<Spec, H, E, R, Provided, ProvideE, ProvideR> {
  readonly [KindTypeId]: Brand<Spec>
  readonly of: (spec: Spec) => Resource<Spec, H, E, R, Provided, ProvideE, ProvideR>
  readonly is: (u: unknown) => u is Resource<Spec, H, E, R, Provided, ProvideE, ProvideR>
}

export type Of<K> = K extends
  Kind<infer Spec, infer H, infer E, infer R, infer Provided, infer ProvideE, infer ProvideR>
  ? Resource<Spec, H, E, R, Provided, ProvideE, ProvideR>
  : never

type SpecSchema = Schema.Constraint & { readonly Type: object }

type HandleOf<Def> = Def extends { readonly acquire: (input: never) => Effect.Effect<infer H, Top, Top> } ? H : never

type InputOf<Def> = Def extends { readonly acquire: (input: infer Input) => Top } ? Input : never

type AcquireError<Def> = Def extends { readonly acquire: (input: never) => Effect.Effect<Top, infer E, Top> } ? E
  : never

type AcquireContext<Def> = Def extends { readonly acquire: (input: never) => Effect.Effect<Top, Top, infer R> }
  ? Exclude<R, Scope.Scope>
  : never

type ProvidedOf<Def> = Def extends
  { readonly context: (self: never) => Effect.Effect<Context.Context<infer Provided>, Top, Top> } ? Provided : never

type ProvideError<Def> = Def extends { readonly context: (self: never) => Effect.Effect<Top, infer E, Top> } ? E
  : never

type ProvideContext<Def> = Def extends { readonly context: (self: never) => Effect.Effect<Top, Top, infer R> }
  ? Exclude<R, Scope.Scope>
  : never

type KindOf<Spec, Def, E, R> = Kind<
  Spec,
  HandleOf<Def>,
  AcquireError<Def> | E,
  AcquireContext<Def> | R,
  ProvidedOf<Def>,
  ProvideError<Def>,
  ProvideContext<Def>
>

interface AnyHandleDefinition<E, R> {
  readonly acquire: (input: Top) => Effect.Effect<object, E, R>
  readonly context: (self: object) => Effect.Effect<Context.Context<never>, E, R>
}

interface AnyOptions<E, R> {
  readonly handle: AnyHandleDefinition<E, R>
  readonly prepare?: (spec: object) => Effect.Effect<Top, E, R>
  readonly ready?: (handle: object, spec: object) => Effect.Effect<Top, E, R>
}

const preparing = <E, R>(options: AnyOptions<E, R>): (spec: object) => Effect.Effect<Top, E, R> =>
  options.prepare ?? Effect.succeed

const readying = <E, R>(options: AnyOptions<E, R>): (handle: object, spec: object) => Effect.Effect<Top, E, R> =>
  options.ready ?? (() => Effect.void)

const makeKind = <E, R>(options: AnyOptions<E, R>): object => {
  const brand = {}
  const prepare = preparing(options)
  const ready = readying(options)
  const of = (spec: object): object => {
    const scoped = Effect.flatMap(
      prepare(spec),
      (input) => Effect.tap(options.handle.acquire(input), (handle) => ready(handle, spec)),
    )
    return {
      [ResourceTypeId]: brand,
      spec,
      scoped,
      layer: Layer.effectContext(Effect.flatMap(scoped, options.handle.context)),
      bind: <Id>(key: Context.Key<Id, object>) => Layer.effect(key)(scoped),
      ...Prototype,
    }
  }
  return {
    [KindTypeId]: brand,
    of,
    is: (u: Top): u is object => Predicate.hasProperty(u, ResourceTypeId) && u[ResourceTypeId] === brand,
  }
}

export function make<S extends SpecSchema, Def extends AnyRootDefinition, ReadyE = never, ReadyR = never>(options: {
  readonly spec: S
  readonly handle: Def & { readonly acquire: (input: S['Type']) => Top }
  readonly ready?: (handle: HandleOf<Def>, spec: S['Type']) => Effect.Effect<Top, ReadyE, ReadyR>
}): KindOf<S['Type'], Def, ReadyE, ReadyR>
export function make<
  S extends SpecSchema,
  Def extends AnyRootDefinition,
  PrepareE,
  PrepareR,
  ReadyE = never,
  ReadyR = never,
>(options: {
  readonly spec: S
  readonly handle: Def
  readonly prepare: (spec: S['Type']) => Effect.Effect<InputOf<Def>, PrepareE, PrepareR>
  readonly ready?: (handle: HandleOf<Def>, spec: S['Type']) => Effect.Effect<Top, ReadyE, ReadyR>
}): KindOf<S['Type'], Def, PrepareE | ReadyE, PrepareR | ReadyR>
export function make(options: { readonly handle: object }): object {
  assertOptions(options)
  return makeKind(options)
}

function assertOptions(_options: object): asserts _options is AnyOptions<never, never> {}

import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import * as OtelResource from '@effect/opentelemetry/Resource'
import { Effect, Layer } from 'effect'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type * as Scope from 'effect/Scope'
import * as Handle from './observation-window.handle.js'
import type { Observation } from './Observation.service.js'
import { ObservationWindowSpec } from './ObservationWindowSpec.schema.js'

export { ObservationWindowSpec }

export {
  collect,
  isObservationWindow,
  type ObservationWindow,
  TypeId as ObservationWindowTypeId,
} from './observation-window.handle.js'

const TypeId = Symbol.for('~systemfsoftware/trace-spec/ObservationWindowResource')
export type TypeId = typeof TypeId

export interface ObservationWindowResource extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly spec: ObservationWindowSpec
  readonly scoped: Effect.Effect<Handle.ObservationWindow, never, Scope.Scope>
  readonly layer: Layer.Layer<Observation | OtelTracer.OtelTracer>
}

const scoped = (spec: ObservationWindowSpec): Effect.Effect<Handle.ObservationWindow, never, Scope.Scope> =>
  Effect.acquireRelease(Effect.sync(() => Handle.make(spec)), Handle.shutdown)

const layer = (spec: ObservationWindowSpec): Layer.Layer<Observation | OtelTracer.OtelTracer> =>
  OtelTracer.layer.pipe(
    Layer.provideMerge(OtelResource.layer({ serviceName: spec.serviceName })),
    Layer.provideMerge(Layer.effectContext(Effect.map(scoped(spec), Handle.context))),
  )

const makeProto = (spec: ObservationWindowSpec): ObservationWindowResource => ({
  [TypeId]: TypeId,
  spec,
  get scoped() {
    return scoped(spec)
  },
  get layer() {
    return layer(spec)
  },
  ...Prototype,
})

export const make = (serviceName: string): ObservationWindowResource =>
  makeProto(new ObservationWindowSpec({ serviceName }))

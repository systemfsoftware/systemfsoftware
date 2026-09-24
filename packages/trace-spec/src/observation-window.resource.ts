import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import * as OtelResource from '@effect/opentelemetry/Resource'
import { Resource } from '@systemfsoftware/effect-cell-types'
import { Effect, Layer } from 'effect'
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

export const TypeId = Symbol.for('~systemfsoftware/trace-spec/ObservationWindowResource')
export type TypeId = typeof TypeId

const scoped = (spec: ObservationWindowSpec): Effect.Effect<Handle.ObservationWindow, never, Scope.Scope> =>
  Effect.acquireRelease(Effect.sync(() => Handle.make(spec)), Handle.shutdown)

const layer = (spec: ObservationWindowSpec): Layer.Layer<Observation | OtelTracer.OtelTracer> =>
  OtelTracer.layer.pipe(
    Layer.provideMerge(OtelResource.layer({ serviceName: spec.serviceName })),
    Layer.provideMerge(Layer.effectContext(Effect.map(scoped(spec), Handle.context))),
  )

const ObservationWindows = Resource.make<ObservationWindowSpec>()({
  typeId: TypeId,
  combinators: {},
  projections: { scoped, layer },
})

export type ObservationWindowResource = Resource.Of<typeof ObservationWindows>

export const make = (serviceName: string): ObservationWindowResource =>
  ObservationWindows.of(new ObservationWindowSpec({ serviceName }))

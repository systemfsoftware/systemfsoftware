import { Conformance } from '@systemfsoftware/conformance-spec'
import { Observation, ObservationWindow } from '@systemfsoftware/trace-spec'
import { Context, Duration, Effect, Layer, Schema, type Scope } from 'effect'

export const SERVICE_NAME = 'trace-spec'

const SPAN_NAME = 'window.release.span'

interface HeldWindow {
  collector?: Observation.Collector
  traceId?: string
}

export interface WindowStopWorld {
  readonly reached: Array<string>
  readonly released: Array<string>
  readonly held: HeldWindow
}

export const windowStopWorld: Effect.Effect<WindowStopWorld> = Effect.sync(() => ({
  reached: [],
  released: [],
  held: {},
}))

interface Held {
  readonly collector: Observation.Collector
  readonly traceId: string
}

const heldOf = (world: WindowStopWorld): Held | undefined => {
  const { collector, traceId } = world.held
  return collector === undefined || traceId === undefined ? undefined : { collector, traceId }
}

const isEmptyObservation = (error: Observation.ObservationFailure): boolean =>
  Schema.is(Observation.EmptyObservationError)(error)

const reachedExporter = (world: WindowStopWorld): Effect.Effect<void> => {
  const held = heldOf(world)
  return held === undefined
    ? Effect.void
    : Effect.matchEffect(held.collector.collect(held.traceId), {
      onFailure: (error) =>
        isEmptyObservation(error)
          ? Effect.sync(() => {
            world.reached.push('a finished span never reached the exporter')
          })
          : Effect.sync(() => {
            world.reached.push(`the exporter failed before the stop: ${error._tag}`)
          }),
      onSuccess: () => Effect.void,
    })
}

const releasedEverything = (world: WindowStopWorld): Effect.Effect<void> => {
  const held = heldOf(world)
  return held === undefined
    ? Effect.void
    : Effect.matchEffect(held.collector.collect(held.traceId), {
      onFailure: (error) =>
        isEmptyObservation(error)
          ? Effect.void
          : Effect.sync(() => {
            world.released.push(`the exporter failed after the stop: ${error._tag}`)
          }),
      onSuccess: (records) =>
        Effect.sync(() => {
          world.released.push(`${records.length} finished span(s) still held after the stop`)
        }),
    })
}

const openAndRecord = (world: WindowStopWorld): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => releasedEverything(world))
    const context = yield* Layer.build(ObservationWindow.make(SERVICE_NAME).layer)
    const recorded = yield* Effect.withSpan(SPAN_NAME)(Effect.orDie(Effect.currentSpan)).pipe(
      Effect.provide(context),
    )
    yield* Effect.sync(() => {
      world.held.collector = Context.get(context, Observation.Observation)
      world.held.traceId = recorded.traceId
    })
    yield* reachedExporter(world)
  })

const windowRule = (world: WindowStopWorld): Effect.Effect<void, Conformance.RuleBroken> => {
  const problems = [...world.reached, ...world.released]
  return problems.length === 0
    ? Effect.void
    : Effect.fail(new Conformance.RuleBroken({ message: problems.join('; ') }))
}

export interface WindowStopSpec {
  readonly world: Effect.Effect<WindowStopWorld>
  readonly program: (world: WindowStopWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly restart: (world: WindowStopWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly rule: (world: WindowStopWorld) => Effect.Effect<void, Conformance.RuleBroken>
  readonly stopWithin: Duration.Input
}

export const windowStopSpec = (): WindowStopSpec => ({
  world: windowStopWorld,
  program: openAndRecord,
  restart: openAndRecord,
  rule: windowRule,
  stopWithin: Duration.zero,
})

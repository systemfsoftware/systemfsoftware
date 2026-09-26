import { Effect, Ref } from 'effect'
import type { Duration } from 'effect'
import type * as Scope from 'effect/Scope'

import { Conformance } from '@systemfsoftware/conformance-spec'

import { type Disk, diskOver, type DiskState, freshDisk } from './Disk.js'
import { ruleFrom } from './Rules.js'

export interface Collector {
  readonly send: (batch: ReadonlyArray<string>) => Effect.Effect<void>
}

export interface Exporter {
  readonly record: (event: string) => Effect.Effect<void>
}

type MakeExporter = (collector: Collector, disk: Disk) => Effect.Effect<Exporter, never, Scope.Scope>

export const exporterEvents: ReadonlyArray<string> = ['e0', 'e1', 'e2', 'e3']

export const exporterStopWithin: Duration.Input = '4 seconds'

const every = '30 millis'
const answering = '5 millis'
const batchSize = 10
const eventTime = '20 millis'
const secondRun = '60 millis'
const eventPrefix = 'event:'

export interface ExporterWorld {
  readonly received: Array<string>
  readonly accepted: Array<string>
  readonly disk: DiskState
  readonly collector: { down: boolean }
  readonly collectorDownAtFirst: boolean
}

export const exporterWorldOf = (collectorDown: boolean): Effect.Effect<ExporterWorld> =>
  Effect.sync(() => ({
    received: [],
    accepted: [],
    disk: freshDisk(),
    collector: { down: collectorDown },
    collectorDownAtFirst: collectorDown,
  }))

const collectorOver = (world: ExporterWorld): Collector => ({
  send: (batch) =>
    Effect.suspend(() => {
      if (world.collector.down) return Effect.never
      world.received.push(...batch)
      return Effect.sleep(answering)
    }),
})

const recorded = (world: ExporterWorld, exporter: Exporter): Effect.Effect<void> =>
  Effect.forEach(
    exporterEvents,
    (event, index) =>
      Effect.andThen(
        Effect.andThen(
          exporter.record(event),
          Effect.sync(() => {
            world.accepted.push(event)
          }),
        ),
        index === exporterEvents.length - 1 ? Effect.void : Effect.sleep(eventTime),
      ),
    { discard: true },
  )

export interface ExporterStart {
  readonly world: ExporterWorld
  readonly starting: 'first' | 'again'
}

export type ExporterImplementation = (start: ExporterStart) => Effect.Effect<void, never, Scope.Scope>

const collectorBackUp = (start: ExporterStart): Effect.Effect<void> =>
  start.starting === 'first'
    ? Effect.void
    : Effect.sync(() => {
      start.world.collector.down = false
    })

const startedOver = (start: ExporterStart, make: MakeExporter): Effect.Effect<Exporter, never, Scope.Scope> =>
  Effect.flatMap(collectorBackUp(start), () => make(collectorOver(start.world), diskOver(start.world.disk)))

const startOf = (start: ExporterStart, make: MakeExporter): Effect.Effect<void, never, Scope.Scope> =>
  Effect.flatMap(
    startedOver(start, make),
    (exporter) => start.starting === 'first' ? recorded(start.world, exporter) : Effect.sleep(secondRun),
  )

const eventKey = (sequence: number): string => `${eventPrefix}${String(sequence).padStart(8, '0')}`

const deliverAllOf = (collector: Collector, disk: Disk): Effect.Effect<void> =>
  Effect.suspend(() => deliverOnceOf(collector, disk))

const deliverOnceOf = (collector: Collector, disk: Disk): Effect.Effect<void> =>
  Effect.gen(function*() {
    const keys = (yield* disk.list(eventPrefix)).slice(0, batchSize)
    if (keys.length === 0) return
    const batch = yield* Effect.forEach(keys, (key) => Effect.map(disk.read(key), (text) => text ?? ''))
    yield* collector.send(batch)
    yield* Effect.forEach(keys, disk.remove, { discard: true })
    yield* deliverAllOf(collector, disk)
  })

const durableExporter: MakeExporter = (collector, disk) =>
  Effect.gen(function*() {
    const sequence = yield* Ref.make((yield* disk.list(eventPrefix)).length)
    const sendAll = deliverAllOf(collector, disk)
    yield* Effect.addFinalizer(() => Effect.asVoid(Effect.timeoutOption(sendAll, exporterStopWithin)))
    yield* Effect.forkScoped(Effect.andThen(sendAll, Effect.forever(Effect.andThen(Effect.sleep(every), sendAll))))
    return {
      record: (event) =>
        Effect.flatMap(Ref.getAndUpdate(sequence, (count) => count + 1), (count) => disk.write(eventKey(count), event)),
    }
  })

export const flushWithinLimit: ExporterImplementation = (start) => startOf(start, durableExporter)

const sendHeldOf = (collector: Collector, held: Ref.Ref<ReadonlyArray<string>>): Effect.Effect<void> =>
  Effect.gen(function*() {
    const batch = (yield* Ref.get(held)).slice(0, batchSize)
    if (batch.length === 0) return
    yield* collector.send(batch)
    yield* Ref.update(held, (all) => all.slice(batch.length))
    yield* sendHeldOf(collector, held)
  })

const unboundedExporter: MakeExporter = (collector) =>
  Effect.gen(function*() {
    const held = yield* Ref.make<ReadonlyArray<string>>([])
    const sendAll = sendHeldOf(collector, held)
    yield* Effect.addFinalizer(() => sendAll)
    yield* Effect.forkScoped(Effect.forever(Effect.andThen(Effect.sleep(every), sendAll)))
    return { record: (event) => Ref.update(held, (all) => [...all, event]) }
  })

export const noLimit: ExporterImplementation = (start) => startOf(start, unboundedExporter)

const takeOneOf = (held: Ref.Ref<ReadonlyArray<string>>): Effect.Effect<string | undefined> =>
  Ref.modify(
    held,
    (all): readonly [string | undefined, ReadonlyArray<string>] =>
      all.length === 0 ? [undefined, all] : [all[0], all.slice(1)],
  )

const sendOneOf = (collector: Collector, held: Ref.Ref<ReadonlyArray<string>>): Effect.Effect<void> =>
  Effect.flatMap(takeOneOf(held), (taken) => (taken === undefined ? Effect.void : collector.send([taken])))

const takingExporter: MakeExporter = (collector) =>
  Effect.gen(function*() {
    const held = yield* Ref.make<ReadonlyArray<string>>([])
    const bounded = Effect.asVoid(Effect.timeoutOption(sendHeldOf(collector, held), exporterStopWithin))
    yield* Effect.addFinalizer(() => bounded)
    yield* Effect.forkScoped(Effect.forever(Effect.andThen(Effect.sleep(every), sendOneOf(collector, held))))
    return { record: (event) => Ref.update(held, (all) => [...all, event]) }
  })

export const takeThenSend: ExporterImplementation = (start) => startOf(start, takingExporter)

const detachingExporter: MakeExporter = (collector) =>
  Effect.gen(function*() {
    const held = yield* Ref.make<ReadonlyArray<string>>([])
    const detach = Effect.flatMap(Ref.getAndSet(held, []), (batch) =>
      batch.length === 0 ? Effect.void : Effect.asVoid(Effect.forkDetach(collector.send(batch))))
    yield* Effect.addFinalizer(() =>
      detach
    )
    yield* Effect.forkScoped(Effect.forever(Effect.andThen(Effect.sleep(every), detach)))
    return { record: (event) => Ref.update(held, (all) => [...all, event]) }
  })

export const detachedFlush: ExporterImplementation = (start) => startOf(start, detachingExporter)

const overrunningExporter: MakeExporter = (collector) =>
  Effect.gen(function*() {
    const held = yield* Ref.make<ReadonlyArray<string>>([])
    const sendAll = sendHeldOf(collector, held)
    yield* Effect.addFinalizer(() => Effect.andThen(Effect.sleep('5 seconds'), sendAll))
    yield* Effect.forkScoped(Effect.forever(Effect.andThen(Effect.sleep(every), sendAll)))
    return { record: (event) => Ref.update(held, (all) => [...all, event]) }
  })

export const overrunsItsLimit: ExporterImplementation = (start) => startOf(start, overrunningExporter)

const deliveryMissed = (world: ExporterWorld): number => world.collectorDownAtFirst ? 0 : missingEvents(world).length

const missingEvents = (world: ExporterWorld): ReadonlyArray<string> =>
  world.accepted.filter((event) => !world.received.includes(event))

const lostMessage = (lost: number): string => `lost ${lost} accepted event${lost === 1 ? '' : 's'}`

const missingMessage = (lost: number): string | undefined => (lost === 0 ? undefined : lostMessage(lost))

export const exporterRule = (world: ExporterWorld): string | undefined => missingMessage(deliveryMissed(world))

export interface ExporterScenario {
  readonly make: ExporterImplementation
  readonly collectorDown: boolean
}

export interface ExporterSpec {
  readonly unit: ExporterImplementation
  readonly world: Effect.Effect<ExporterWorld>
  readonly program: (world: ExporterWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly restart: (world: ExporterWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly rule: (world: ExporterWorld) => Effect.Effect<void, Conformance.RuleBroken>
  readonly stopWithin: Duration.Input
}

export const exporterSpec = (scenario: ExporterScenario): ExporterSpec => ({
  unit: scenario.make,
  world: exporterWorldOf(scenario.collectorDown),
  program: (world) => scenario.make({ world, starting: 'first' }),
  restart: (world) => scenario.make({ world, starting: 'again' }),
  rule: (world) => ruleFrom(exporterRule(world)),
  stopWithin: exporterStopWithin,
})

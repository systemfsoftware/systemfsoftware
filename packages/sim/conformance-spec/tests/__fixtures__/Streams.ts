import { Effect, Queue, Stream } from 'effect'
import type { Duration } from 'effect'
import type * as Scope from 'effect/Scope'

import { Conformance } from '@systemfsoftware/conformance-spec'

import { ruleFrom } from './Rules.js'

/**
 * A fake source outside the unit: what it offers, and what the unit took.
 * `Stream.callback` hands the source's values over through a fiber the stream
 * machinery forks into a scope of its own — one no stop of the unit's reaches,
 * because only that scope's close ends it, and closing it ends the unit's own
 * caller too.
 */
export interface RelayWorld {
  readonly offered: ReadonlyArray<number>
  readonly taken: Array<number>
}

/** A fresh source per run. */
export const relayWorld: Effect.Effect<RelayWorld> = Effect.sync(() => ({ offered: [1, 2, 3], taken: [] }))

const relayStopWithin: Duration.Input = '1 second'

export type RelayImplementation = (world: RelayWorld) => Effect.Effect<void, never, Scope.Scope>

/** A correct relay: every value the source offers is taken. */
const takingRelay: RelayImplementation = (world) =>
  Stream.callback<number>((queue) =>
    Effect.sync(() => {
      for (const value of world.offered) Queue.offerUnsafe(queue, value)
      Queue.endUnsafe(queue)
    })
  ).pipe(
    Stream.runForEach((value) =>
      Effect.sync(() => {
        world.taken.push(value)
      })
    ),
  )

const missedOffers = (world: RelayWorld): ReadonlyArray<number> =>
  world.offered.filter((value) => !world.taken.includes(value))

const missedMessage = (missed: ReadonlyArray<number>): string =>
  `expected every offered value to be taken, missed ${String(missed.length)}: ${missed.join(', ')}`

export const relayRule = (world: RelayWorld): string | undefined => {
  const missed = missedOffers(world)
  return missed.length === 0 ? undefined : missedMessage(missed)
}

export interface RelaySpec {
  readonly unit: RelayImplementation
  readonly world: Effect.Effect<RelayWorld>
  readonly program: (world: RelayWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly restart: (world: RelayWorld) => Effect.Effect<void, never, Scope.Scope>
  readonly rule: (world: RelayWorld) => Effect.Effect<void, Conformance.RuleBroken>
  readonly stopWithin: Duration.Input
}

export const relaySpec = (implementation: RelayImplementation): RelaySpec => ({
  unit: implementation,
  world: relayWorld,
  program: implementation,
  restart: implementation,
  rule: (world) => ruleFrom(relayRule(world)),
  stopWithin: relayStopWithin,
})

export const relayTakingEveryOffer: RelayImplementation = takingRelay

const waitingRelay: RelayImplementation = (world) =>
  Stream.callback<number>((queue) =>
    Effect.sync(() => {
      for (const value of world.offered) Queue.offerUnsafe(queue, value)
    })
  ).pipe(
    Stream.runForEach((value) =>
      Effect.sync(() => {
        world.taken.push(value)
      })
    ),
  )

export const relayWaitingForever: RelayImplementation = waitingRelay

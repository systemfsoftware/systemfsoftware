import * as AtomRpc from '@systemfsoftware/effect-atom/AtomRpc'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as Result from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Rpc, RpcGroup, RpcTest } from 'effect/unstable/rpc'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const Group = RpcGroup.make(
  Rpc.make('getUser', {
    payload: Schema.Struct({ id: Schema.FiniteFromString }),
    success: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  }),
  Rpc.make('createUser', {
    payload: Schema.Struct({ name: Schema.String }),
    success: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  }),
)

const StreamGroup = RpcGroup.make(
  Rpc.make('getItems', {
    payload: Schema.Struct({ count: Schema.Number }),
    success: Schema.Struct({ id: Schema.Number, name: Schema.String }),
    stream: true,
  }),
)

// An rpc double that answers user reads and counts every call it receives.
// Each call builds a fresh in-memory client, so scenarios never share counts.
const makeCountingUserServer = () => {
  let calls = 0
  const makeEffect = RpcTest.makeClient(Group, { flatten: true }).pipe(
    Effect.provide(Group.toLayer({
      getUser: (payload) => {
        calls++
        return Effect.succeed({ id: payload.id, name: `user-${payload.id}` })
      },
      createUser: () => Effect.die('unexpected call: createUser'),
    })),
  )
  return { makeEffect, callsMade: () => calls }
}

// An rpc double that accepts new records.
const makeAcceptingUserServer = () => {
  const makeEffect = RpcTest.makeClient(Group, { flatten: true }).pipe(
    Effect.provide(Group.toLayer({
      getUser: () => Effect.die('unexpected call: getUser'),
      createUser: (payload) => Effect.succeed({ id: 1, name: payload.name }),
    })),
  )
  return { makeEffect }
}

// An rpc double that streams two records.
const makeItemStreamServer = () => {
  const makeEffect = RpcTest.makeClient(StreamGroup, { flatten: true }).pipe(
    Effect.provide(StreamGroup.toLayer({
      getItems: () =>
        Stream.fromIterable([
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ]),
    })),
  )
  return { makeEffect }
}

// An rpc double that answers user reads, accepts new records, and counts
// every call it receives. Each call builds a fresh in-memory client, so
// scenarios never share counts.
const makeUserDirectoryServer = () => {
  let calls = 0
  const makeEffect = RpcTest.makeClient(Group, { flatten: true }).pipe(
    Effect.provide(Group.toLayer({
      getUser: () => {
        calls++
        return Effect.succeed({ id: 1, name: 'user-1' })
      },
      createUser: (payload) => {
        calls++
        return Effect.succeed({ id: 1, name: payload.name })
      },
    })),
  )
  return { makeEffect, callsMade: () => calls }
}

Feature('A page feeds itself from an rpc service and keeps the answers live across reloads')
  .body(({ scenario }) => {
    const askedOnlyOnce = (s: { readonly calls: number }): void => {
      expect(s.calls).toBe(1)
    }

    scenario(
      'A fetched profile is still there after the page comes back without asking the service again',
      Gherkin.Do.pipe(
        Given('a profile page backed by a user directory')('setup', () =>
          Effect.sync(() => {
            const { makeEffect, callsMade } = makeCountingUserServer()
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: Layer.empty,
              makeEffect,
            })
            const user = Client.query('getUser', { id: 1 }, { serializationKey: '1' })
            const registry = Registry.make()
            return { user, registry, callsMade }
          })),
        When('the profile is shown and the page is saved and comes back')('calls', (s) =>
          Effect.gen(function*() {
            const unmount = s.setup.registry.mount(s.setup.user)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const savedPage = Hydration.dehydrate(s.setup.registry)
            unmount()
            const freshPage = Registry.make()
            Hydration.hydrate(freshPage, savedPage)
            yield* Effect.yieldNow
            return s.setup.callsMade()
          })),
        Then('the service was asked only once')(askedOnlyOnce),
      ),
    )

    const sharedAnswerAskedOnce = (s: {
      readonly outcome: { readonly same: boolean; readonly calls: number }
    }): void => {
      expect(s.outcome.same).toBe(true)
      expect(s.outcome.calls).toBe(1)
    }

    scenario(
      'Asking twice for the same profile asks the service once',
      Gherkin.Do.pipe(
        Given('a user directory and two identical profile requests')('setup', () =>
          Effect.sync(() => {
            const { makeEffect, callsMade } = makeCountingUserServer()
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: Layer.empty,
              makeEffect,
            })
            const first = Client.query('getUser', { id: 1 }, { serializationKey: '1' })
            const second = Client.query('getUser', { id: 1 }, { serializationKey: '1' })
            const registry = Registry.make()
            return { first, second, registry, callsMade }
          })),
        When('both requests are shown')('outcome', (s) =>
          Effect.gen(function*() {
            s.setup.registry.mount(s.setup.first)
            s.setup.registry.mount(s.setup.second)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return { same: s.setup.first === s.setup.second, calls: s.setup.callsMade() }
          })),
        Then('they share one answer and the service was asked once')(sharedAnswerAskedOnce),
      ),
    )

    const staySettingsIntact = (s: {
      readonly kept: { readonly idleTTL: number | undefined; readonly keepAlive: boolean; readonly calls: number }
    }): void => {
      expect(s.kept.idleTTL).toBe(60_000)
      expect(s.kept.keepAlive).toBe(true)
      expect(s.kept.calls).toBe(1)
    }

    scenario(
      'A profile with a longer stay keeps its settings across a reload',
      Gherkin.Do.pipe(
        Given('a profile with stay settings backed by a user directory')('setup', () =>
          Effect.sync(() => {
            const { makeEffect, callsMade } = makeCountingUserServer()
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: Layer.empty,
              makeEffect,
            })
            const user = Client.query('getUser', { id: 1 }, {
              headers: { 'x-page': 'home' },
              timeToLive: '1 minute',
              serializationKey: '1',
            })
            const keptUser = Client.query('getUser', { id: 2 }, {
              timeToLive: 'Infinity',
              serializationKey: 'keep',
            })
            const registry = Registry.make()
            return { user, keptUser, registry, callsMade }
          })),
        When('the profile page is saved and comes back')('kept', (s) =>
          Effect.gen(function*() {
            const unmount = s.setup.registry.mount(s.setup.user)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const savedPage = Hydration.dehydrate(s.setup.registry)
            unmount()
            const freshPage = Registry.make()
            Hydration.hydrate(freshPage, savedPage)
            yield* Effect.yieldNow
            return {
              idleTTL: s.setup.user.idleTTL,
              keepAlive: s.setup.keptUser.keepAlive,
              calls: s.setup.callsMade(),
            }
          })),
        Then('the stay settings are intact and the service was asked once')(staySettingsIntact),
      ),
    )

    const profileDetailsArrive = (s: {
      readonly outcome: Result.Result<{ readonly id: number; readonly name: string }, unknown>
    }): void => {
      expect(Result.isSuccess(s.outcome)).toBe(true)
      expect(Result.value(s.outcome)).toEqual(Option.some({ id: 1, name: 'user-1' }))
    }

    scenario(
      'A profile loads through a service connection built for the page',
      Gherkin.Do.pipe(
        Given('a user directory reached through a page-scoped connection')('setup', () =>
          Effect.sync(() => {
            const { makeEffect } = makeCountingUserServer()
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: () => Layer.empty,
              makeEffect,
            })
            const user = Client.query('getUser', { id: 1 })
            const registry = Registry.make()
            return { user, registry }
          })),
        When('the profile is shown')('outcome', (s) =>
          Effect.gen(function*() {
            const unmount = s.setup.registry.mount(s.setup.user)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const outcome = s.setup.registry.get(s.setup.user)
            unmount()
            return outcome
          })),
        Then('the profile details arrive')(profileDetailsArrive),
      ),
    )

    const recordedProfileComesBack = (s: {
      readonly outcome: Result.Result<{ readonly id: number; readonly name: string }, unknown>
    }): void => {
      expect(Result.isSuccess(s.outcome)).toBe(true)
      expect(Result.value(s.outcome)).toEqual(Option.some({ id: 1, name: 'grace' }))
    }

    scenario(
      'A new profile sent to the service comes back recorded',
      Gherkin.Do.pipe(
        Given('a directory that accepts new profiles and a submission form')('setup', () =>
          Effect.sync(() => {
            const { makeEffect } = makeAcceptingUserServer()
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: Layer.empty,
              makeEffect,
            })
            const create = Client.mutation('createUser')
            const registry = Registry.make()
            return { create, registry }
          })),
        When('the name is submitted')('outcome', (s) =>
          Effect.gen(function*() {
            s.setup.registry.mount(s.setup.create)
            s.setup.registry.set(s.setup.create, { payload: { name: 'grace' } })
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.setup.registry.get(s.setup.create)
          })),
        Then('the recorded profile comes back')(recordedProfileComesBack),
      ),
    )

    const watchedProfileRefreshes = (s: {
      readonly readings: {
        readonly first: Result.Result<{ readonly id: number; readonly name: string }, unknown>
        readonly second: Result.Result<{ readonly id: number; readonly name: string }, unknown>
        readonly calls: number
      }
    }): void => {
      expect(Result.isSuccess(s.readings.first)).toBe(true)
      expect(Result.isSuccess(s.readings.second)).toBe(true)
      expect(s.readings.calls).toBe(3)
    }

    scenario(
      'A watched profile refreshes after a new profile is added',
      Gherkin.Do.pipe(
        Given('a watched profile and a submission form sharing a watch key')('setup', () =>
          Effect.sync(() => {
            const { makeEffect, callsMade } = makeUserDirectoryServer()
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: Layer.empty,
              makeEffect,
            })
            const user = Client.query('getUser', { id: 1 }, { reactivityKeys: ['users'] })
            const create = Client.mutation('createUser')
            const registry = Registry.make()
            return { user, create, registry, callsMade }
          })),
        When('a new profile is submitted under the same watch key')('readings', (s) =>
          Effect.gen(function*() {
            const unmount = s.setup.registry.mount(s.setup.user)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const first = s.setup.registry.get(s.setup.user)
            s.setup.registry.set(s.setup.create, {
              payload: { name: 'grace' },
              reactivityKeys: ['users'],
            })
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const second = s.setup.registry.get(s.setup.user)
            unmount()
            return { first, second, calls: s.setup.callsMade() }
          })),
        Then('both readings succeed and the directory was asked three times')(watchedProfileRefreshes),
      ),
    )

    const feedArrivesInOrder = (s: {
      readonly final: Result.Result<
        { readonly done: boolean; readonly items: ReadonlyArray<{ readonly id: number; readonly name: string }> },
        unknown
      >
    }): void => {
      expect(Result.isSuccess(s.final)).toBe(true)
      expect(Option.map(Result.value(s.final), (pulled) => pulled.done)).toEqual(Option.some(true))
      expect(Option.map(Result.value(s.final), (pulled) => [...pulled.items])).toEqual(
        Option.some([
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ]),
      )
    }

    scenario(
      'A feed of records arrives in order until it ends',
      Gherkin.Do.pipe(
        Given('a service streaming two records')('setup', () =>
          Effect.sync(() => {
            const { makeEffect } = makeItemStreamServer()
            const Client = AtomRpc.Service()('Client', {
              group: StreamGroup,
              protocol: Layer.empty,
              makeEffect,
            })
            const feed = Client.query('getItems', { count: 2 })
            const registry = Registry.make()
            return { feed, registry }
          })),
        When('the page pulls the feed to the end')('final', (s) =>
          Effect.gen(function*() {
            const unmount = s.setup.registry.mount(s.setup.feed)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            s.setup.registry.set(s.setup.feed, undefined)
            yield* Effect.yieldNow
            s.setup.registry.set(s.setup.feed, undefined)
            yield* Effect.yieldNow
            s.setup.registry.set(s.setup.feed, undefined)
            yield* Effect.yieldNow
            const final = s.setup.registry.get(s.setup.feed)
            unmount()
            return final
          })),
        Then('the records arrive in order and the feed is done')(feedArrivesInOrder),
      ),
    )
  })

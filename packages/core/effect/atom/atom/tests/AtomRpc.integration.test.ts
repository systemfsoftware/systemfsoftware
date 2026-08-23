import * as AtomRpc from '@systemfsoftware/effect-atom/AtomRpc'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as Result from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Schema, Stream } from 'effect'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'
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

Feature('Reusing an rpc-fetched user after the page reloads, without calling the server again')
  .body(({ scenario }) => {
    scenario(
      'A user fetched once over rpc is still available on a freshly reloaded page',
      Gherkin.Do.pipe(
        Given('a page that calls an rpc server that always answers, remembering the answer for reload')(
          'ctx',
          () =>
            Effect.sync(() => {
              let callCount = 0
              const makeEffect = Effect.succeed(
                (tag: string, payload: { readonly id: number }) => {
                  callCount++
                  if (tag !== 'getUser') {
                    return Effect.die(`unexpected tag: ${tag}`)
                  }
                  return Effect.succeed({ id: payload.id, name: `user-${payload.id}` })
                },
              )
              const Client = AtomRpc.Service()('Client', {
                group: Group,
                protocol: Layer.empty,
                makeEffect,
              })
              const user = Client.query('getUser', { id: 1 }, { serializationKey: '1' })
              const registry = Registry.make()
              return { user, registry, callsMade: () => callCount }
            }),
        ),
        When('the user is read, the page is reloaded, and read again on the fresh page')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const unmount = s.ctx.registry.mount(s.ctx.user)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const savedPage = Hydration.dehydrate(s.ctx.registry)
              unmount()
              const freshPage = Registry.make()
              Hydration.hydrate(freshPage, savedPage)
              const secondReading = freshPage.get(s.ctx.user)
              return { secondReading, calls: s.ctx.callsMade() }
            }),
        ),
        Then('the fresh page shows the user without calling the server a second time')((s) => {
          expect(s.result.calls).toBe(1)
        }),
      ),
    )
    scenario(
      'Asking for the same query twice yields the same atom, so the server is called once',
      Gherkin.Do.pipe(
        Given('a page that calls an rpc server that counts calls')('ctx', () =>
          Effect.sync(() => {
            let callCount = 0
            const makeEffect = Effect.succeed(
              (tag: string, payload: { readonly id: number }) => {
                callCount++
                return Effect.succeed({ id: payload.id, name: `user-${payload.id}` })
              },
            )
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: Layer.empty,
              makeEffect,
            })
            const first = Client.query('getUser', { id: 1 }, { serializationKey: '1' })
            const second = Client.query('getUser', { id: 1 }, { serializationKey: '1' })
            const registry = Registry.make()
            return { first, second, registry, callsMade: () => callCount }
          })),
        When('both queries are mounted and read')('result', (s) =>
          Effect.gen(function*() {
            s.ctx.registry.mount(s.ctx.first)
            s.ctx.registry.mount(s.ctx.second)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return { sameAtom: s.ctx.first === s.ctx.second, calls: s.ctx.callsMade() }
          })),
        Then('both queries share one atom and the server is called once')((s) => {
          expect(s.result.sameAtom).toBe(true)
          expect(s.result.calls).toBe(1)
        }),
      ),
    )
    scenario(
      'A change submitted over rpc runs the call and reports the created record',
      Gherkin.Do.pipe(
        Given('a page that submits new records over rpc to a server that accepts them')('ctx', () =>
          Effect.sync(() => {
            const makeEffect = Effect.succeed(
              (tag: string, payload: { readonly name: string }) => {
                if (tag !== 'createUser') {
                  return Effect.die(`unexpected tag: ${tag}`)
                }
                return Effect.succeed({ id: 1, name: payload.name })
              },
            )
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: Layer.empty,
              makeEffect,
            })
            const create = Client.mutation('createUser')
            const registry = Registry.make()
            return { create, registry }
          })),
        When('a new record is submitted')('outcome', (s) =>
          Effect.gen(function*() {
            s.ctx.registry.mount(s.ctx.create)
            s.ctx.registry.set(s.ctx.create, { payload: { name: 'grace' } })
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.ctx.registry.get(s.ctx.create)
          })),
        Then('the created record is reported')((s) => {
          expect(Result.isSuccess(s.outcome)).toBe(true)
          if (Result.isSuccess(s.outcome)) {
            expect(s.outcome.value).toEqual({ id: 1, name: 'grace' })
          }
        }),
      ),
    )
    scenario(
      'A stream of records from an rpc server is pulled into the page as it arrives',
      Gherkin.Do.pipe(
        Given('a page whose rpc server streams two records')('ctx', () =>
          Effect.sync(() => {
            let callCount = 0
            const makeEffect = Effect.succeed(
              (tag: string) => {
                callCount++
                if (tag !== 'getItems') {
                  return Effect.die(`unexpected tag: ${tag}`)
                }
                return Stream.fromIterable([
                  { id: 1, name: 'first' },
                  { id: 2, name: 'second' },
                ])
              },
            )
            const Client = AtomRpc.Service()('Client', {
              group: StreamGroup,
              protocol: Layer.empty,
              makeEffect,
            })
            const feed = Client.query('getItems', { count: 2 })
            const registry = Registry.make()
            return { feed, registry, callsMade: () => callCount }
          })),
        When('the feed is mounted and pulled until the server finishes')('final', (s) =>
          Effect.gen(function*() {
            const unmount = s.ctx.registry.mount(s.ctx.feed)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            s.ctx.registry.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            s.ctx.registry.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            s.ctx.registry.set(s.ctx.feed, void 0)
            yield* Effect.yieldNow
            const final = s.ctx.registry.get(s.ctx.feed)
            unmount()
            return final
          })),
        Then('the records arrived in order and the feed is marked finished')((s) => {
          expect(Result.isSuccess(s.final)).toBe(true)
          if (Result.isSuccess(s.final)) {
            expect(s.final.value.done).toBe(true)
            expect([...s.final.value.items]).toEqual([
              { id: 1, name: 'first' },
              { id: 2, name: 'second' },
            ])
          }
        }),
      ),
    )
    scenario(
      'A change submitted with reactivity keys refetches the queries watching those keys',
      Gherkin.Do.pipe(
        Given('a page with a watched user query and a record submission that invalidates the users key')(
          'ctx',
          () =>
            Effect.sync(() => {
              let callCount = 0
              const makeEffect = Effect.succeed(
                (tag: string, payload: { readonly id?: number; readonly name?: string }) => {
                  callCount++
                  if (tag === 'getUser') {
                    return Effect.succeed({ id: 1, name: 'user-1' })
                  }
                  if (tag === 'createUser') {
                    return Effect.succeed({ id: 1, name: payload.name ?? '' })
                  }
                  return Effect.die(`unexpected tag: ${tag}`)
                },
              )
              const Client = AtomRpc.Service()('Client', {
                group: Group,
                protocol: Layer.empty,
                makeEffect,
              })
              const user = Client.query('getUser', { id: 1 }, { reactivityKeys: ['users'] })
              const create = Client.mutation('createUser')
              const registry = Registry.make()
              return { user, create, registry, callsMade: () => callCount }
            }),
        ),
        When(
          'the user is read, a record is submitted while invalidating the users key, and the user is read again',
        )('readings', (s) =>
          Effect.gen(function*() {
            const unmount = s.ctx.registry.mount(s.ctx.user)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const first = s.ctx.registry.get(s.ctx.user)
            s.ctx.registry.set(s.ctx.create, {
              payload: { name: 'grace' },
              reactivityKeys: ['users'],
            })
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const second = s.ctx.registry.get(s.ctx.user)
            const calls = s.ctx.callsMade()
            unmount()
            return { first, second, calls }
          })),
        Then('the change ran and the watched user was fetched again')((s) => {
          expect(Result.isSuccess(s.readings.first)).toBe(true)
          expect(Result.isSuccess(s.readings.second)).toBe(true)
          expect(s.readings.calls).toBe(3)
        }),
      ),
    )
    scenario(
      'A client built with a protocol function answers the same as one built with a layer',
      Gherkin.Do.pipe(
        Given('a page that builds its rpc client with a protocol function')('ctx', () =>
          Effect.sync(() => {
            const makeEffect = Effect.succeed(
              (tag: string, payload: { readonly id: number }) => {
                if (tag !== 'getUser') {
                  return Effect.die(`unexpected tag: ${tag}`)
                }
                return Effect.succeed({ id: payload.id, name: `user-${payload.id}` })
              },
            )
            const Client = AtomRpc.Service()('Client', {
              group: Group,
              protocol: () => Layer.empty,
              makeEffect,
            })
            const user = Client.query('getUser', { id: 1 })
            const registry = Registry.make()
            return { user, registry }
          })),
        When('the user is read')('outcome', (s) =>
          Effect.gen(function*() {
            const unmount = s.ctx.registry.mount(s.ctx.user)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const outcome = s.ctx.registry.get(s.ctx.user)
            unmount()
            return outcome
          })),
        Then('the user is reported')((s) => {
          expect(Result.isSuccess(s.outcome)).toBe(true)
          if (Result.isSuccess(s.outcome)) {
            expect(s.outcome.value).toEqual({ id: 1, name: 'user-1' })
          }
        }),
      ),
    )
    scenario(
      'A query asked for headers, a minute-long retention, and a hydration key survives reload, while a query asked to stay alive forever is kept',
      Gherkin.Do.pipe(
        Given(
          'a page that fetches the user with headers, a finite retention, and a hydration key, and another user kept alive forever',
        )('ctx', () =>
          Effect.sync(() => {
            let callCount = 0
            const makeEffect = Effect.succeed(
              (tag: string, payload: { readonly id: number }) => {
                callCount++
                if (tag !== 'getUser') {
                  return Effect.die(`unexpected tag: ${tag}`)
                }
                return Effect.succeed({ id: payload.id, name: `user-${payload.id}` })
              },
            )
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
            return {
              user,
              keptUser,
              registry,
              callsMade: () => callCount,
              idleTTL: user.idleTTL,
              keepAlive: keptUser.keepAlive,
            }
          })),
        When('the user is read and the page is reloaded')('result', (s) =>
          Effect.gen(function*() {
            const unmount = s.ctx.registry.mount(s.ctx.user)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const savedPage = Hydration.dehydrate(s.ctx.registry)
            unmount()
            const freshPage = Registry.make()
            Hydration.hydrate(freshPage, savedPage)
            const secondReading = freshPage.get(s.ctx.user)
            return { secondReading, calls: s.ctx.callsMade() }
          })),
        Then('the first query keeps its retention and the second stays alive, and reload does not refetch')((s) => {
          expect(s.ctx.idleTTL).toBe(60_000)
          expect(s.ctx.keepAlive).toBe(true)
          expect(s.result.calls).toBe(1)
        }),
      ),
    )
  })

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import { Effect, Layer, Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'
import { expect } from 'vitest'
import * as AtomRpc from '../src/AtomRpc.js'
import * as Hydration from '../src/Hydration.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

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
                ((tag: string, payload: { readonly id: number }) => {
                  callCount++
                  if (tag !== 'getUser') {
                    return Effect.die(`unexpected tag: ${tag}`)
                  }
                  return Effect.succeed({ id: payload.id, name: `user-${payload.id}` })
                }) as any,
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
  })

Feature('Submitting a change over rpc')
  .body(({ scenario }) => {
    scenario(
      'A change submitted over rpc runs the call and reports the created record',
      Gherkin.Do.pipe(
        Given('a page that submits new records over rpc to a server that accepts them')('ctx', () =>
          Effect.sync(() => {
            const makeEffect = Effect.succeed(
              ((tag: string, payload: { readonly name: string }) => {
                if (tag !== 'createUser') {
                  return Effect.die(`unexpected tag: ${tag}`)
                }
                return Effect.succeed({ id: 1, name: payload.name })
              }) as any,
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
  })

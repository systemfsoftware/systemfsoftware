import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import type * as HttpClientError from 'effect/unstable/http/HttpClientError'
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi'
import { expect } from 'vitest'
import * as AtomHttpApi from '../src/AtomHttpApi.js'
import * as Hydration from '../src/Hydration.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

const Feature = makeFeature({ it, layer })

const Api = HttpApi.make('api').add(
  HttpApiGroup.make('group').add(
    HttpApiEndpoint.get('get', '/users/:id', {
      params: { id: Schema.FiniteFromString },
    }),
  ),
)

const MutationApi = HttpApi.make('api').add(
  HttpApiGroup.make('group').add(
    HttpApiEndpoint.post('create', '/users', {
      payload: Schema.Struct({ name: Schema.String }),
      success: Schema.Struct({ id: Schema.Number, name: Schema.String }),
    }),
  ),
)

Feature('Reusing a fetched profile after the page reloads, without asking the server again')
  .body(({ scenario }) => {
    scenario(
      'A profile fetched once is still available on a freshly reloaded page',
      Gherkin.Do.pipe(
        Given('a page that fetches a user profile from a server that always answers')('ctx', () =>
          Effect.sync(() => {
            let callCount = 0
            const httpClient = HttpClient.makeWith(
              Effect.fnUntraced(function*(requestEffect) {
                const request = yield* requestEffect
                callCount++
                return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
              }),
              Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>,
            )
            const Client = AtomHttpApi.Service()('Client', {
              api: Api,
              httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
            })
            const profile = Client.query('group', 'get', { params: { id: 1 }, serializationKey: '1' })
            const registry = Registry.make()
            return { profile, registry, callsMade: () => callCount }
          })),
        When('the profile is read, the page is reloaded, and the profile is read again on the fresh page')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const unmount = s.ctx.registry.mount(s.ctx.profile)
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              yield* Effect.yieldNow
              const savedPage = Hydration.dehydrate(s.ctx.registry)
              unmount()

              const freshPage = Registry.make()
              Hydration.hydrate(freshPage, savedPage)
              const secondReading = freshPage.get(s.ctx.profile)

              return { secondReading, calls: s.ctx.callsMade() }
            }),
        ),
        Then('the fresh page shows the profile without fetching it a second time')((s) => {
          expect(s.result.calls).toBe(1)
        }),
      ),
    )

    scenario(
      'Two parts of the page reading a profile that never arrives still agree it is loading',
      Gherkin.Do.pipe(
        Given('a page that fetches a user profile from a server that never answers')('ctx', () =>
          Effect.sync(() => {
            const httpClient = HttpClient.makeWith(
              Effect.fnUntraced(function*(requestEffect) {
                yield* requestEffect
                return yield* Effect.never
              }),
              Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>,
            )
            const Client = AtomHttpApi.Service()('Client', {
              api: Api,
              httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
            })
            const profile = Client.query('group', 'get', { params: { id: 1 } })
            const registry = Registry.make()
            return { profile, registry }
          })),
        When('two parts of the page read the profile while the request is still pending')(
          'result',
          (s) =>
            Effect.sync(() => ({
              firstReading: s.ctx.registry.get(s.ctx.profile),
              secondReading: s.ctx.registry.get(s.ctx.profile),
            })),
        ),
        Then('both parts agree the profile is still loading, not a stale or broken value')((s) => {
          expect(s.result.firstReading.waiting || s.result.firstReading._tag === 'Initial').toBe(true)
          expect(s.result.secondReading.waiting || s.result.secondReading._tag === 'Initial').toBe(true)
        }),
      ),
    )
  })

Feature('Submitting a change to the server')
  .body(({ scenario }) => {
    scenario(
      'A submitted change runs the call and reports the created record',
      Gherkin.Do.pipe(
        Given('a page that submits new records to a server that accepts them')('ctx', () =>
          Effect.sync(() => {
            const httpClient = HttpClient.makeWith(
              Effect.fnUntraced(function*(requestEffect) {
                const request = yield* requestEffect
                return HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ id: 1, name: 'grace' }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                  }),
                )
              }),
              Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>,
            )
            const Client = AtomHttpApi.Service()('Client', {
              api: MutationApi,
              httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
            })
            const create = Client.mutation('group', 'create')
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
      'A submission the server rejects is reported as a failure',
      Gherkin.Do.pipe(
        Given('a page that submits new records to a server that rejects them')('ctx', () =>
          Effect.sync(() => {
            const httpClient = HttpClient.makeWith(
              Effect.fnUntraced(function*(requestEffect) {
                const request = yield* requestEffect
                return HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ message: 'nope' }), {
                    status: 500,
                    headers: { 'content-type': 'application/json' },
                  }),
                )
              }),
              Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>,
            )
            const Client = AtomHttpApi.Service()('Client', {
              api: MutationApi,
              httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
            })
            const create = Client.mutation('group', 'create')
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
        Then('the submission is reported as failed')((s) => {
          expect(Result.isFailure(s.outcome)).toBe(true)
        }),
      ),
    )
  })

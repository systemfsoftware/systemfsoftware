import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Option, Schema } from 'effect'
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

const QueryAndMutationApi = HttpApi.make('api').add(
  HttpApiGroup.make('group').add(
    HttpApiEndpoint.get('get', '/users/:id', {
      params: { id: Schema.FiniteFromString },
    }),
    HttpApiEndpoint.post('create', '/users', {
      payload: Schema.Struct({ name: Schema.String }),
      success: Schema.Struct({ id: Schema.Number, name: Schema.String }),
    }),
  ),
)

const ApiWithRejection = HttpApi.make('api').add(
  HttpApiGroup.make('group').add(
    HttpApiEndpoint.post('create', '/users', {
      payload: Schema.Struct({ name: Schema.String }),
      success: Schema.Struct({ id: Schema.Number, name: Schema.String }),
      error: Schema.Struct({ message: Schema.String }),
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

Feature('Building an http client from the page context')
  .body(({ scenario }) => {
    scenario(
      'A client whose http client comes from a function answers the same',
      Gherkin.Do.pipe(
        Given('a page that builds its http client from the page context')('ctx', () =>
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
              httpClient: () => Layer.succeed(HttpClient.HttpClient, httpClient),
            })
            const profile = Client.query('group', 'get', { params: { id: 1 } })
            const registry = Registry.make()
            return { profile, registry, callsMade: () => callCount }
          })),
        When('the profile is read')('outcome', (s) =>
          Effect.gen(function*() {
            const unmount = s.ctx.registry.mount(s.ctx.profile)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const outcome = s.ctx.registry.get(s.ctx.profile)
            unmount()
            return outcome
          })),
        Then('the profile is reported from the derived client')((s) => {
          expect(Result.isSuccess(s.outcome)).toBe(true)
          expect(s.ctx.callsMade()).toBe(1)
        }),
      ),
    )
  })

Feature('Refreshing watched queries after an http submission')
  .body(({ scenario }) => {
    scenario(
      'A submission with reactivity keys refetches the watched profile',
      Gherkin.Do.pipe(
        Given('a page with a watched profile query and a record submission that invalidates the profiles key')(
          'ctx',
          () =>
            Effect.sync(() => {
              let callCount = 0
              const httpClient = HttpClient.makeWith(
                Effect.fnUntraced(function*(requestEffect) {
                  const request = yield* requestEffect
                  callCount++
                  if (request.url === '/users/1') {
                    return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
                  }
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
                api: QueryAndMutationApi,
                httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
              })
              const profile = Client.query('group', 'get', { params: { id: 1 }, reactivityKeys: ['profiles'] })
              const create = Client.mutation('group', 'create')
              const registry = Registry.make()
              return { profile, create, registry, callsMade: () => callCount }
            }),
        ),
        When(
          'the profile is read, a record is submitted while invalidating the profiles key, and the profile is read again',
        )('readings', (s) =>
          Effect.gen(function*() {
            const unmount = s.ctx.registry.mount(s.ctx.profile)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const first = s.ctx.registry.get(s.ctx.profile)
            s.ctx.registry.set(s.ctx.create, {
              payload: { name: 'grace' },
              reactivityKeys: ['profiles'],
            })
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            const second = s.ctx.registry.get(s.ctx.profile)
            const calls = s.ctx.callsMade()
            unmount()
            return { first, second, calls }
          })),
        Then('the submission ran and the watched profile was fetched again')((s) => {
          expect(Result.isSuccess(s.readings.first)).toBe(true)
          expect(Result.isSuccess(s.readings.second)).toBe(true)
          expect(s.readings.calls).toBe(3)
        }),
      ),
    )
  })

Feature('Keeping the raw response from an http submission')
  .body(({ scenario }) => {
    scenario(
      'A submission that asks for the raw response reports it without decoding',
      Gherkin.Do.pipe(
        Given('a page that submits records and keeps the raw response')('ctx', () =>
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
            const create = Client.mutation('group', 'create', { responseMode: 'response-only' })
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
        Then('the raw response is reported')((s) => {
          expect(Result.isSuccess(s.outcome)).toBe(true)
          if (Result.isSuccess(s.outcome)) {
            expect(s.outcome.value.status).toBe(200)
          }
        }),
      ),
    )
  })

Feature('Retaining and hydrating an http profile')
  .body(({ scenario }) => {
    scenario(
      'A profile fetched with reactivity keys, a minute-long retention, and a hydration key survives reload, while a profile asked to stay alive forever is kept',
      Gherkin.Do.pipe(
        Given(
          'a page that fetches the profile with reactivity keys, a finite retention, and a hydration key, and another profile kept alive forever',
        )('ctx', () =>
          Effect.sync(() => {
            const httpClient = HttpClient.makeWith(
              Effect.fnUntraced(function*(requestEffect) {
                const request = yield* requestEffect
                return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
              }),
              Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>,
            )
            const Client = AtomHttpApi.Service()('Client', {
              api: Api,
              httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
            })
            const profile = Client.query('group', 'get', {
              params: { id: 1 },
              reactivityKeys: ['profiles'],
              timeToLive: '1 minute',
              serializationKey: '1',
            })
            const keptProfile = Client.query('group', 'get', {
              params: { id: 2 },
              timeToLive: 'Infinity',
              serializationKey: 'keep',
            })
            const registry = Registry.make()
            return {
              profile,
              keptProfile,
              registry,
              idleTTL: profile.idleTTL,
              keepAlive: keptProfile.keepAlive,
            }
          })),
        When('the profile is read, the page is reloaded, and the profile is read again')(
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
              return { secondReading }
            }),
        ),
        Then('the first profile keeps its retention and the second stays alive, and reload still shows the profile')(
          (s) => {
            expect(s.ctx.idleTTL).toBe(60_000)
            expect(s.ctx.keepAlive).toBe(true)
            expect(Result.isSuccess(s.result.secondReading)).toBe(true)
          },
        ),
      ),
    )
  })

Feature('Surviving a broken response from the server')
  .body(({ scenario }) => {
    scenario(
      'A submission answered with a body that does not match the contract is reported as a defect rather than a normal failure',
      Gherkin.Do.pipe(
        Given('a page that submits records to a server that answers with an unreadable body')(
          'ctx',
          () =>
            Effect.sync(() => {
              const httpClient = HttpClient.makeWith(
                Effect.fnUntraced(function*(requestEffect) {
                  const request = yield* requestEffect
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(JSON.stringify({ oops: true }), {
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
            }),
        ),
        When('a new record is submitted')('outcome', (s) =>
          Effect.gen(function*() {
            s.ctx.registry.mount(s.ctx.create)
            s.ctx.registry.set(s.ctx.create, { payload: { name: 'grace' } })
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.ctx.registry.get(s.ctx.create)
          })),
        Then('the submission is reported as a defect rather than a normal failure')((s) => {
          expect(Result.isFailure(s.outcome)).toBe(true)
          expect(Result.error(s.outcome)).toEqual(Option.none())
        }),
      ),
    )
  })

Feature('Reporting a rejection the server describes')
  .body(({ scenario }) => {
    scenario(
      'A submission the server rejects with a matching error body is reported as a normal failure carrying that error',
      Gherkin.Do.pipe(
        Given('a page that submits records to a server that rejects them with a described error')(
          'ctx',
          () =>
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
                api: ApiWithRejection,
                httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
              })
              const create = Client.mutation('group', 'create')
              const registry = Registry.make()
              return { create, registry }
            }),
        ),
        When('a new record is submitted')('outcome', (s) =>
          Effect.gen(function*() {
            s.ctx.registry.mount(s.ctx.create)
            s.ctx.registry.set(s.ctx.create, { payload: { name: 'grace' } })
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            return s.ctx.registry.get(s.ctx.create)
          })),
        Then('the submission is reported as a normal failure with the described error')((s) => {
          expect(Result.isFailure(s.outcome)).toBe(true)
          expect(Result.error(s.outcome)).toEqual(Option.some({ message: 'nope' }))
        }),
      ),
    )
  })

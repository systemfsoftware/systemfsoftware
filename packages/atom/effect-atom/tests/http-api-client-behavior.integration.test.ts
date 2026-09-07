import * as AtomHttpApi from '@systemfsoftware/effect-atom/AtomHttpApi'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as Result from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'
import type { HttpClientError } from 'effect/unstable/http/HttpClientError'
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const stubHttpClient = (
  handle: (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientResponse.HttpClientResponse>,
): HttpClient.HttpClient =>
  HttpClient.makeWith(
    (requestEffect: Effect.Effect<HttpClientRequest.HttpClientRequest, HttpClientError, never>) =>
      Effect.flatMap(requestEffect, handle),
    (request: HttpClientRequest.HttpClientRequest) => Effect.succeed(request),
  )

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

Feature('A page feeds itself from an http api and keeps its answers live across reloads').body(({ scenario }) => {
  const assertProfileLoads = (s: { readonly reading: Result.Result<unknown, unknown> }): void => {
    expect(Result.isSuccess(s.reading)).toBe(true)
  }

  scenario(
    'A profile shown on the page loads when the server answers with no content',
    Gherkin.Do.pipe(
      Given('a profile page whose server answers with no content')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
          )
          const Client = AtomHttpApi.Service()('Client', {
            api: Api,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const profile = Client.query('group', 'get', { params: { id: 1 } })
          const page = Registry.make()
          return { page, profile }
        })),
      When('the profile is shown on the page')('reading', (s) =>
        Effect.gen(function*() {
          const unmount = s.setup.page.mount(s.setup.profile)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const reading = s.setup.page.get(s.setup.profile)
          unmount()
          return reading
        })),
      Then('the page reports a loaded profile')(assertProfileLoads),
    ),
  )

  const assertCreatedRecordShown = (s: { readonly reading: Result.Result<unknown, unknown> }): void => {
    expect(Result.isSuccess(s.reading)).toBe(true)
    expect(Result.value(s.reading)).toEqual(Option.some({ id: 1, name: 'grace' }))
  }

  scenario(
    'A name submitted on the page comes back with the record the server created',
    Gherkin.Do.pipe(
      Given('a page that creates users through the api')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(JSON.stringify({ id: 1, name: 'grace' }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                }),
              ),
            )
          )
          const Client = AtomHttpApi.Service()('Client', {
            api: MutationApi,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const create = Client.mutation('group', 'create')
          const page = Registry.make()
          return { create, page }
        })),
      When('grace is submitted')('reading', (s) =>
        Effect.gen(function*() {
          s.setup.page.mount(s.setup.create)
          s.setup.page.set(s.setup.create, { payload: { name: 'grace' } })
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.create)
        })),
      Then('the page shows the created record')(assertCreatedRecordShown),
    ),
  )

  const assertSubmissionFailed = (s: { readonly reading: Result.Result<unknown, unknown> }): void => {
    expect(Result.isFailure(s.reading)).toBe(true)
  }

  scenario(
    'A submission the server rejects shows as a failure on the page',
    Gherkin.Do.pipe(
      Given('a page whose server turns submissions away')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(JSON.stringify({ message: 'nope' }), {
                  status: 500,
                  headers: { 'content-type': 'application/json' },
                }),
              ),
            )
          )
          const Client = AtomHttpApi.Service()('Client', {
            api: MutationApi,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const create = Client.mutation('group', 'create')
          const page = Registry.make()
          return { create, page }
        })),
      When('grace is submitted anyway')('reading', (s) =>
        Effect.gen(function*() {
          s.setup.page.mount(s.setup.create)
          s.setup.page.set(s.setup.create, { payload: { name: 'grace' } })
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.create)
        })),
      Then('the page reports the submission failed')(assertSubmissionFailed),
    ),
  )

  const assertContextTransportLoadsOnce = (s: {
    readonly outcome: { readonly fetches: number; readonly reading: Result.Result<unknown, unknown> }
  }): void => {
    expect(Result.isSuccess(s.outcome.reading)).toBe(true)
    expect(s.outcome.fetches).toBe(1)
  }

  scenario(
    'A page that builds its transport from its own context still loads its profile',
    Gherkin.Do.pipe(
      Given('a profile page whose transport comes from the page itself')('setup', () =>
        Effect.sync(() => {
          const calls = { count: 0 }
          const httpClient = stubHttpClient((request) => {
            calls.count++
            return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
          })
          const Client = AtomHttpApi.Service()('Client', {
            api: Api,
            httpClient: () => Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const profile = Client.query('group', 'get', { params: { id: 1 } })
          const page = Registry.make()
          return { calls, page, profile }
        })),
      When('the profile is shown on the page')('outcome', (s) =>
        Effect.gen(function*() {
          const unmount = s.setup.page.mount(s.setup.profile)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const reading = s.setup.page.get(s.setup.profile)
          unmount()
          return { fetches: s.setup.calls.count, reading }
        })),
      Then('the profile loads and the server was asked exactly once')(assertContextTransportLoadsOnce),
    ),
  )

  scenario(
    'A profile kept at a known place on the api loads on the page',
    Gherkin.Do.pipe(
      Given('a profile page pointed at a known place on the api')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
          )
          const Client = AtomHttpApi.Service()('Client', {
            api: Api,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const profile = Client.query('group', 'get', { params: { id: 1 } })
          const page = Registry.make()
          return { page, profile }
        })),
      When('the profile is shown on the page')('reading', (s) =>
        Effect.gen(function*() {
          const unmount = s.setup.page.mount(s.setup.profile)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const reading = s.setup.page.get(s.setup.profile)
          unmount()
          return reading
        })),
      Then('the page reports a loaded profile')(assertProfileLoads),
    ),
  )

  const assertBothReadsStayLoading = (s: {
    readonly readings: {
      readonly first: Result.Result<unknown, unknown>
      readonly second: Result.Result<unknown, unknown>
    }
  }): void => {
    expect(Result.isSuccess(s.readings.first)).toBe(false)
    expect(Result.isFailure(s.readings.first)).toBe(false)
    expect(Result.isSuccess(s.readings.second)).toBe(false)
    expect(Result.isFailure(s.readings.second)).toBe(false)
  }

  scenario(
    'A profile whose answer never arrives stays loading no matter how often it is read',
    Gherkin.Do.pipe(
      Given('a profile page whose server never answers')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient(() => Effect.never)
          const Client = AtomHttpApi.Service()('Client', {
            api: Api,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const profile = Client.query('group', 'get', { params: { id: 1 } })
          const page = Registry.make()
          return { page, profile }
        })),
      When('the profile is read twice')('readings', (s) =>
        Effect.sync(() => {
          s.setup.page.mount(s.setup.profile)
          const first = s.setup.page.get(s.setup.profile)
          const second = s.setup.page.get(s.setup.profile)
          return { first, second }
        })),
      Then('both reads stay loading')(assertBothReadsStayLoading),
    ),
  )

  const assertUnreadableFailure = (s: { readonly reading: Result.Result<unknown, unknown> }): void => {
    expect(Result.isFailure(s.reading)).toBe(true)
    expect(Result.error(s.reading)).toEqual(Option.none())
  }

  scenario(
    'A created record the page cannot read shows a failure with no usable error',
    Gherkin.Do.pipe(
      Given('a page whose server answers new users in a shape the page cannot read')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(JSON.stringify({ oops: true }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                }),
              ),
            )
          )
          const Client = AtomHttpApi.Service()('Client', {
            api: MutationApi,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const create = Client.mutation('group', 'create')
          const page = Registry.make()
          return { create, page }
        })),
      When('grace is submitted')('reading', (s) =>
        Effect.gen(function*() {
          s.setup.page.mount(s.setup.create)
          s.setup.page.set(s.setup.create, { payload: { name: 'grace' } })
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.create)
        })),
      Then('the page reports failure with nothing usable to show')(assertUnreadableFailure),
    ),
  )

  const assertTypedRejection = (s: { readonly reading: Result.Result<unknown, unknown> }): void => {
    expect(Result.isFailure(s.reading)).toBe(true)
    expect(Result.error(s.reading)).toEqual(Option.some({ message: 'nope' }))
  }

  scenario(
    'A rejection the page understands arrives carrying the server’s explanation',
    Gherkin.Do.pipe(
      Given('a page that understands why the server turns submissions away')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(JSON.stringify({ message: 'nope' }), {
                  status: 500,
                  headers: { 'content-type': 'application/json' },
                }),
              ),
            )
          )
          const Client = AtomHttpApi.Service()('Client', {
            api: ApiWithRejection,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const create = Client.mutation('group', 'create')
          const page = Registry.make()
          return { create, page }
        })),
      When('grace is submitted')('reading', (s) =>
        Effect.gen(function*() {
          s.setup.page.mount(s.setup.create)
          s.setup.page.set(s.setup.create, { payload: { name: 'grace' } })
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          return s.setup.page.get(s.setup.create)
        })),
      Then('the failure carries the server’s explanation')(assertTypedRejection),
    ),
  )

  const assertWatchedListRefetched = (s: {
    readonly outcome: {
      readonly fetches: number
      readonly first: Result.Result<unknown, unknown>
      readonly second: Result.Result<unknown, unknown>
    }
  }): void => {
    expect(Result.isSuccess(s.outcome.first)).toBe(true)
    expect(Result.isSuccess(s.outcome.second)).toBe(true)
    expect(s.outcome.fetches).toBe(3)
  }

  scenario(
    'Profiles watching a list refresh after a new name is submitted',
    Gherkin.Do.pipe(
      Given('a watched list with one profile and a way to add names')('setup', () =>
        Effect.sync(() => {
          const calls = { count: 0 }
          const httpClient = stubHttpClient((request) => {
            calls.count++
            if (request.url === '/users/1') {
              return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
            }
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(JSON.stringify({ id: 1, name: 'grace' }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                }),
              ),
            )
          })
          const Client = AtomHttpApi.Service()('Client', {
            api: QueryAndMutationApi,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const profile = Client.query('group', 'get', { params: { id: 1 }, reactivityKeys: ['profiles'] })
          const create = Client.mutation('group', 'create')
          const page = Registry.make()
          return { calls, create, page, profile }
        })),
      When('a new name is submitted after the first read')('outcome', (s) =>
        Effect.gen(function*() {
          const unmount = s.setup.page.mount(s.setup.profile)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const first = s.setup.page.get(s.setup.profile)
          s.setup.page.set(s.setup.create, {
            payload: { name: 'grace' },
            reactivityKeys: ['profiles'],
          })
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const second = s.setup.page.get(s.setup.profile)
          const fetches = s.setup.calls.count
          unmount()
          return { fetches, first, second }
        })),
      Then('both reads succeed and the list was fetched again')(assertWatchedListRefetched),
    ),
  )

  const assertReloadKeepsLifetimes = (s: {
    readonly reading: Result.Result<unknown, unknown>
    readonly setup: {
      readonly keptProfile: { readonly keepAlive: boolean }
      readonly page: Registry.Registry
      readonly profile: { readonly idleTTL?: number }
    }
  }): void => {
    expect(s.setup.profile.idleTTL).toBe(60_000)
    expect(s.setup.keptProfile.keepAlive).toBe(true)
    expect(Result.isSuccess(s.reading)).toBe(true)
  }

  scenario(
    'A profile with a short memory survives a reload while a kept one stays alive',
    Gherkin.Do.pipe(
      Given('a page with one short-lived profile and one kept forever')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
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
          const page = Registry.make()
          return { keptProfile, page, profile }
        })),
      When('the page is reloaded from a saved copy')('reading', (s) =>
        Effect.gen(function*() {
          const unmount = s.setup.page.mount(s.setup.profile)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const savedPage = Hydration.dehydrate(s.setup.page)
          unmount()
          const freshPage = Registry.make()
          Hydration.hydrate(freshPage, savedPage)
          yield* Effect.yieldNow
          return freshPage.get(s.setup.profile)
        })),
      Then('the reloaded profile still reads and the lifetimes hold')(assertReloadKeepsLifetimes),
    ),
  )

  const assertReloadAskedOnce = (s: { readonly fetches: number }): void => {
    expect(s.fetches).toBe(1)
  }

  scenario(
    'A reloaded page shows a saved profile without asking the server again',
    Gherkin.Do.pipe(
      Given('a page showing a saved profile')('setup', () =>
        Effect.sync(() => {
          const calls = { count: 0 }
          const httpClient = stubHttpClient((request) => {
            calls.count++
            return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
          })
          const Client = AtomHttpApi.Service()('Client', {
            api: Api,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const profile = Client.query('group', 'get', { params: { id: 1 }, serializationKey: '1' })
          const page = Registry.make()
          return { calls, page, profile }
        })),
      When('the page reloads from its saved copy')('fetches', (s) =>
        Effect.gen(function*() {
          const unmount = s.setup.page.mount(s.setup.profile)
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const savedPage = Hydration.dehydrate(s.setup.page)
          unmount()
          const freshPage = Registry.make()
          Hydration.hydrate(freshPage, savedPage)
          yield* Effect.yieldNow
          return s.setup.calls.count
        })),
      Then('the server was asked only once')(assertReloadAskedOnce),
    ),
  )

  const assertRawAnswerKept = (s: {
    readonly outcome: {
      readonly reading: Result.Result<unknown, unknown>
      readonly status: Option.Option<unknown>
    }
  }): void => {
    expect(Result.isSuccess(s.outcome.reading)).toBe(true)
    expect(s.outcome.status).toEqual(Option.some(200))
  }

  scenario(
    'A submission read raw hands back the untouched server answer',
    Gherkin.Do.pipe(
      Given('a page that reads submissions without decoding them')('setup', () =>
        Effect.sync(() => {
          const httpClient = stubHttpClient((request) =>
            Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(JSON.stringify({ id: 1, name: 'grace' }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                }),
              ),
            )
          )
          const Client = AtomHttpApi.Service()('Client', {
            api: MutationApi,
            httpClient: Layer.succeed(HttpClient.HttpClient, httpClient),
          })
          const create = Client.mutation('group', 'create', { responseMode: 'response-only' })
          const page = Registry.make()
          return { create, page }
        })),
      When('grace is submitted')('outcome', (s) =>
        Effect.gen(function*() {
          s.setup.page.mount(s.setup.create)
          s.setup.page.set(s.setup.create, { payload: { name: 'grace' } })
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          const reading = s.setup.page.get(s.setup.create)
          return { reading, status: Option.map(Result.value(reading), (response) => response.status) }
        })),
      Then('the untouched answer is on the page')(assertRawAnswerKept),
    ),
  )
})

import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  Harness,
  type HarnessOptions,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, Result, Schema } from 'effect'
import { echoBundle, FacetReport, loaderBundle, LoaderReport, workerdChildren } from './__fixtures__/harness.fixture.js'

const Feature = makeFeature({ it })

const BACKEND_WORKER = `export default { fetch: (request) => new Response('backend:' + new URL(request.url).pathname) }`

const echoOptions: HarnessOptions = { worker: echoBundle }

const loaderOptions: HarnessOptions = {
  worker: loaderBundle,
  durableObjects: [{ className: 'Supervisor', storage: 'sqlite' }],
  bindings: [
    { _tag: 'DurableObject', name: 'SUP', className: 'Supervisor' },
    { _tag: 'WorkerLoader', name: 'LOADER' },
  ],
}

const serviceOptions: HarnessOptions = {
  worker: loaderBundle,
  durableObjects: [{ className: 'Supervisor', storage: 'sqlite' }],
  fetchTriggers: ['harness.local'],
  bindings: [
    { _tag: 'DurableObject', name: 'SUP', className: 'Supervisor' },
    { _tag: 'WorkerLoader', name: 'LOADER' },
    { _tag: 'Service', name: 'BACKEND', worker: 'backend' },
  ],
  services: [{ name: 'backend', worker: BACKEND_WORKER }],
}

const runWithHarness = <A, E>(
  options: HarnessOptions,
  program: (harness: HarnessShape) => Effect.Effect<A, E, Harness>,
): Effect.Effect<A, E | HarnessStartFailed> =>
  Effect.scoped(
    Effect.gen(function*() {
      const harness = yield* Harness
      return yield* program(harness)
    }).pipe(Effect.provide(layer(options))),
  )

const facetRows = (harness: HarnessShape, name: string, value: string) =>
  Effect.gen(function*() {
    const response = yield* harness.dispatchFetch(`http://harness/facet?name=${name}&value=${value}`)
    const body = yield* Effect.promise(() => response.json())
    const report = yield* Schema.decodeUnknownEffect(FacetReport)(body)
    return report.rows
  })

Feature('Running a bundled Worker in real workerd through the harness')
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime starts, serves the Worker and is disposed on scope close')
  .body(({ scenario }) => {
    scenario(
      'The echo Worker answers a dispatched body with the same body',
      Gherkin.Do.pipe(
        When('a body is dispatched to the echo Worker')(
          'echoed',
          () =>
            runWithHarness(echoOptions, (harness) =>
              Effect.gen(function*() {
                const response = yield* harness.dispatchFetch('http://harness/echo', {
                  method: 'POST',
                  body: 'hello workerd',
                })
                return yield* Effect.promise(() => response.text())
              })),
        ),
        Then('the answer is the dispatched body')((s, expect) => expect(s.echoed).toEqual('hello workerd')),
      ),
    )

    scenario(
      'A Worker Loader isolate with no outbound is refused the internet',
      Gherkin.Do.pipe(
        When('the Worker loads a module that fetches the internet')(
          'message',
          () =>
            runWithHarness(loaderOptions, (harness) =>
              Effect.gen(function*() {
                const response = yield* harness.dispatchFetch('http://harness/loader')
                const body = yield* Effect.promise(() => response.json())
                const report = yield* Schema.decodeUnknownEffect(LoaderReport)(body)
                return report.message
              })),
        ),
        Then('the load reports the runtime refusal')((s, expect) =>
          expect(s.message).toContain('not permitted to access the internet')
        ),
      ),
    )

    scenario(
      'Two facets of one Durable Object keep separate SQLite rows',
      Gherkin.Do.pipe(
        When('one request writes facet a twice and facet b once')(
          'rows',
          () =>
            runWithHarness(loaderOptions, (harness) =>
              Effect.gen(function*() {
                yield* facetRows(harness, 'a', 'one')
                const a = yield* facetRows(harness, 'a', 'two')
                const b = yield* facetRows(harness, 'b', 'other')
                return { a, b }
              })),
        ),
        Then('each facet sees only its own rows')((s, expect) =>
          expect(s.rows).toEqual({ a: ['one', 'two'], b: ['other'] })
        ),
      ),
    )

    scenario(
      'The primary Worker and the harness both reach the outbound service binding',
      Gherkin.Do.pipe(
        Given('a harness with an outbound service binding')(
          'observed',
          () =>
            runWithHarness(serviceOptions, (harness) =>
              Effect.gen(function*() {
                const dispatched = yield* harness.dispatchFetch('http://harness.local/service')
                const supervisor = yield* Effect.promise(() => dispatched.text())
                const bound = yield* harness.service('BACKEND')
                const response = yield* Effect.tryPromise(() => bound.fetch('http://backend/direct'))
                const direct = yield* Effect.promise(() => response.text())
                return { supervisor, direct }
              })),
        ),
        Then('both answer from the same backend Worker')((s, expect) =>
          expect(s.observed).toEqual({
            supervisor: 'supervisor saw backend:/from-supervisor',
            direct: 'backend:/direct',
          })
        ),
      ),
    )

    scenario(
      'A closed scope leaves a typed HarnessClosed error and no workerd process',
      Gherkin.Do.pipe(
        When('the harness is used after its scope closes')('after', () =>
          Effect.gen(function*() {
            const harness = yield* runWithHarness(echoOptions, (running) =>
              Effect.gen(function*() {
                const response = yield* running.dispatchFetch('http://harness/echo', {
                  method: 'POST',
                  body: 'before close',
                })
                yield* Effect.promise(() => response.text())
                return running
              }))
            const observed = yield* Effect.result(
              harness.dispatchFetch('http://harness/echo', { method: 'POST', body: 'after close' }),
            )
            const tag = Result.match(observed, {
              onFailure: (error) => error._tag,
              onSuccess: () => 'Completed',
            })
            return { tag, workerd: workerdChildren() }
          })),
        Then('the call answers HarnessClosed and the runtime is gone')((s, expect) =>
          expect(s.after).toEqual({ tag: 'HarnessClosed', workerd: [] })
        ),
      ),
    )
  })

/**
 * Server-side rendering scenarios for the React atom hooks.
 *
 * These scenarios run in a dedicated node-mode Vitest project
 * (`test.projects[].node` in `vitest.config.ts`) because the browser-mode
 * suite cannot exercise `useSyncExternalStore`'s server-snapshot path: the
 * node project renders components with `renderToString` from
 * `react-dom/server`, which calls `getServerSnapshot` for every store read.
 *
 * @since 4.0.0
 */
import { HydrationBoundary, RegistryContext, useAtomValue } from '@systemfsoftware/effect-atom-react'
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import * as Layer from 'effect/Layer'
import * as Scheduler from 'effect/Scheduler'
import * as Schema from 'effect/Schema'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { expect } from 'vitest'

/**
 * An Atom registry owns its timer and task ports. A registry built inside a
 * scenario takes those ports from the kernel's clock and scheduler, so nothing
 * it schedules reaches the host's timers.
 */
interface RegistryPorts {
  readonly now: () => number
  readonly scheduleTask: (task: () => void) => () => void
  readonly scheduleTimer: (task: () => void, delayMillis: number) => () => void
}

const cancelled = (): void => {}

const sleptTask = (clock: Clock.Clock, task: () => void, delayMillis: number) =>
  Effect.provideService(
    Effect.andThen(Effect.sleep(delayMillis), Effect.sync(task)),
    Clock.Clock,
    clock,
  )

const timerFor = (
  clock: Clock.Clock,
  scheduler: Scheduler.Scheduler,
  task: () => void,
  delayMillis: number,
): () => void => {
  const fiber = Effect.runFork(sleptTask(clock, task, delayMillis), { scheduler })
  return () => {
    Effect.runFork(Fiber.interrupt(fiber), { scheduler })
  }
}

const kernelPorts = (clock: Clock.Clock, scheduler: Scheduler.Scheduler): RegistryPorts => {
  const dispatcher = scheduler.makeDispatcher()
  return {
    now: () => clock.currentTimeMillisUnsafe(),
    scheduleTask: (task) => {
      dispatcher.scheduleTask(task, 0)
      return cancelled
    },
    scheduleTimer: (task, delayMillis) => timerFor(clock, scheduler, task, delayMillis),
  }
}

const portsFromRun: Effect.Effect<RegistryPorts> = Effect.gen(function*() {
  const clock = yield* Clock.Clock
  const scheduler = yield* Scheduler.Scheduler
  return kernelPorts(clock, scheduler)
})

/** Blocks until the registry reports a settled value for the atom, resuming from the subscription. */
const settledOn = (
  registry: AtomRegistry.Registry,
  atom: Atom.Atom<AsyncResult.Result<number, never>>,
): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    let stopListening = (): void => {}
    const settled = (value: AsyncResult.Result<number, never>): void => {
      if (AsyncResult.isSuccess(value)) {
        stopListening()
        resume(Effect.void)
      }
    }
    stopListening = registry.subscribe(atom, settled, { immediate: true })
    return Effect.sync(stopListening)
  })
const Feature = makeFeature({ it })

Feature('Serving shared-value pages from the server')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A counter served without a preloaded value runs its read on the server',
      Gherkin.Do.pipe(
        Given('Ada opens a page whose counter has no preloaded value')('ctx', () =>
          Effect.gen(function*() {
            const ports = yield* portsFromRun
            let reads = 0
            const counter = Atom.make(() => {
              reads = reads + 1
              return 0
            })

            function Page() {
              const count = useAtomValue(counter)
              return React.createElement('div', null, count)
            }

            const servedHtml = renderToString(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make(ports) },
                React.createElement(Page),
              ),
            )
            return { reads: () => reads, servedHtml }
          })),
        When('Ada reads the served markup')('seen', (s) => Effect.sync(() => s.ctx)),
        Then('the counter ran its read once and the served page shows zero')((s) => {
          expect(s.seen.reads()).toBe(1)
          expect(s.seen.servedHtml).toContain('0')
        }),
      ),
    )
    scenario(
      'A page served with a placeholder for its data skips the fetch and says it is loading',
      Gherkin.Do.pipe(
        Given('Ada opens a page whose profile is served as a loading placeholder')('ctx', () =>
          Effect.gen(function*() {
            const ports = yield* portsFromRun
            let fetches = 0
            const profile = Atom.make(Effect.sync(() => {
              fetches = fetches + 1
              return 0
            })).pipe(Atom.withServerValueInitial)
            const page = AtomRegistry.make(ports)

            function ProfilePage() {
              const result = useAtomValue(profile)
              return React.createElement(
                'div',
                null,
                AsyncResult.match(result, {
                  onInitial: () => 'Loading profile',
                  onSuccess: () => 'Profile ready',
                  onFailure: () => 'Profile failed',
                }),
              )
            }

            const servedHtml = renderToString(
              React.createElement(
                RegistryContext.Provider,
                { value: page },
                React.createElement(ProfilePage),
              ),
            )
            expect(fetches).toBe(0)
            expect(servedHtml).toContain('Loading profile')
            return { fetches: () => fetches, servedHtml, page, profile }
          })),
        When('Ada opens the same profile on her own device, which runs the fetch')('seen', (s) =>
          Effect.sync(() => {
            const profile = s.ctx.page.get(s.ctx.profile)
            return { profile }
          })),
        Then('the fetch ran once and her device shows the profile as ready')((s) => {
          expect(s.ctx.fetches()).toBe(1)
          expect(AsyncResult.isSuccess(s.seen.profile)).toBe(true)
        }),
      ),
    )
    scenario(
      'A page served with saved values shows each one in the state the server saw it',
      Gherkin.Do.pipe(
        Given(
          'Ada opens a page saved with a ready count, a ready total, a failed total, and a total still loading',
        )('ctx', () =>
          Effect.gen(function*() {
            const ports = yield* portsFromRun
            const count = Atom.make(0).pipe(
              Atom.serializable({
                key: 'basic',
                schema: Schema.Finite,
              }),
            )
            const makeTotal = (key: string, effect: Effect.Effect<number, string>) =>
              Atom.make(effect).pipe(
                Atom.serializable({
                  key,
                  schema: AsyncResult.Schema({
                    success: Schema.Finite,
                    error: Schema.String,
                  }),
                }),
              )

            const readyTotal = makeTotal('success', Effect.succeed(123))
            const failedTotal = makeTotal('errored', Effect.fail('error'))
            const loadingTotal = makeTotal('pending', Effect.never)
            const serverPage = AtomRegistry.make(ports)
            serverPage.set(count, 1)
            serverPage.mount(readyTotal)
            serverPage.mount(failedTotal)
            serverPage.mount(loadingTotal)
            const savedPage = Hydration.dehydrate(serverPage, { encodeInitialAs: 'value-only' })

            function Count() {
              const value = useAtomValue(count)
              return React.createElement('div', { 'data-testid': 'value' }, value)
            }

            function ReadyTotal() {
              const value = useAtomValue(readyTotal)
              return AsyncResult.match(value, {
                onSuccess: (success) => React.createElement('div', { 'data-testid': 'value-1' }, success.value),
                onFailure: () => React.createElement('div', { 'data-testid': 'error-1' }, 'Error'),
                onInitial: () => React.createElement('div', { 'data-testid': 'loading-1' }, 'Loading...'),
              })
            }

            function FailedTotal() {
              const value = useAtomValue(failedTotal)
              return AsyncResult.match(value, {
                onSuccess: (success) => React.createElement('div', { 'data-testid': 'value-2' }, success.value),
                onFailure: () => React.createElement('div', { 'data-testid': 'error-2' }, 'Error'),
                onInitial: () => React.createElement('div', { 'data-testid': 'loading-2' }, 'Loading...'),
              })
            }

            function LoadingTotal() {
              const value = useAtomValue(loadingTotal)
              return AsyncResult.match(value, {
                onSuccess: (success) => React.createElement('div', { 'data-testid': 'value-3' }, success.value),
                onFailure: () => React.createElement('div', { 'data-testid': 'error-3' }, 'Error'),
                onInitial: () => React.createElement('div', { 'data-testid': 'loading-3' }, 'Loading...'),
              })
            }

            const servedHtml = renderToString(
              React.createElement(
                RegistryContext.Provider,
                { value: AtomRegistry.make(ports) },
                React.createElement(
                  HydrationBoundary,
                  { state: savedPage },
                  React.createElement(Count),
                  React.createElement(ReadyTotal),
                  React.createElement(FailedTotal),
                  React.createElement(LoadingTotal),
                ),
              ),
            )
            return { servedHtml }
          })),
        When('Ada reads the served page for each saved value')('seen', (s) => Effect.sync(() => s.ctx.servedHtml)),
        Then('the ready count, the ready total, the failed total, and the loading total are each on screen')((s) => {
          expect(s.seen).toContain('data-testid="value">1<')
          expect(s.seen).toContain('data-testid="value-1">123<')
          expect(s.seen).toContain('data-testid="error-2">Error<')
          expect(s.seen).toContain('data-testid="loading-3">Loading...<')
        }),
      ),
    )

    scenario(
      'A page served while its data is missing shows the data once the server finishes it',
      Gherkin.Do.pipe(
        Given('Ada opens a page whose number is still being computed on the server')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const ports = yield* portsFromRun
              const latch = Latch.makeUnsafe()
              let reads = 0
              let finished = 0
              const number = Atom.make(
                Effect.gen(function*() {
                  reads = reads + 1
                  yield* latch.await
                  finished = finished + 1
                  return 1
                }),
              ).pipe(
                Atom.serializable({
                  key: 'test',
                  schema: AsyncResult.Schema({
                    success: Schema.Finite,
                  }),
                }),
              )

              const serverPage = AtomRegistry.make(ports)
              serverPage.mount(number)

              const before = { reads, finished }

              const savedPage = Hydration.dehydrate(serverPage, {
                encodeInitialAs: 'deferred',
              })

              function Page() {
                const value = useAtomValue(number)
                return React.createElement(
                  'div',
                  null,
                  AsyncResult.match(value, {
                    onInitial: () => 'Initial',
                    onSuccess: () => 'Success',
                    onFailure: () => 'Failure',
                  }),
                )
              }

              const readerPage = AtomRegistry.make(ports)
              const servedHtml = renderToString(
                React.createElement(
                  RegistryContext.Provider,
                  { value: readerPage },
                  React.createElement(
                    HydrationBoundary,
                    { state: savedPage },
                    React.createElement(Page),
                  ),
                ),
              )
              return {
                number,
                before,
                readerPage,
                latch,
                servedHtml,
                readCounters: () => ({ reads, finished }),
                serverPage,
              }
            }),
        ),
        When('the server finishes computing the number and the saved page reaches the reader')(
          'shown',
          (s) =>
            Effect.gen(function*() {
              s.ctx.latch.openUnsafe()
              yield* settledOn(s.ctx.serverPage, s.ctx.number)
              yield* settledOn(s.ctx.readerPage, s.ctx.number)
              return AsyncResult.getOrThrow(s.ctx.readerPage.get(s.ctx.number))
            }),
        ),
        Then('the reader sees the computed number, read once, on a page that first said it was missing')((s) => {
          expect(s.ctx.before.reads).toBe(1)
          expect(s.ctx.before.finished).toBe(0)
          expect(s.ctx.servedHtml).toContain('Initial')
          const counters = s.ctx.readCounters()
          expect(counters.reads).toBe(1)
          expect(s.shown).toBe(1)
          expect(counters.finished).toBe(1)
        }),
      ),
    )
  })

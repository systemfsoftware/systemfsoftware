import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Effect, Fiber, Schema } from 'effect'
import { expect, vi } from 'vitest'
import * as Atom from '../src/Atom.js'
import * as Hydration from '../src/Hydration.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

const Feature = makeFeature({ it, layer })

Feature("Saving a page's values so a reloaded page starts with them already filled in")
  .body(({ scenario }) => {
    scenario(
      'A saved value is still there after the page reloads and its cleanup timer runs',
      Gherkin.Do.pipe(
        Given('a page with a saved value, and cleanup enabled after a short idle period')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const base = Atom.make(42)
              const savedValue = base.pipe(
                Atom.serializable({
                  key: 'k1',
                  schema: Schema.Number,
                }),
              )
              const page = Registry.make({ defaultIdleTTL: 5 })
              page.get(savedValue)
              const saved = Hydration.dehydrate(page)
              const reloadedPage = Registry.make({ defaultIdleTTL: 5 })
              Hydration.hydrate(reloadedPage, saved)
              return { reloadedPage, savedValue }
            }),
        ),
        When('the value is read on the reloaded page, then read again after the cleanup timer runs')(
          'result',
          (s) =>
            Effect.sync(() => {
              const firstReading = s.ctx.reloadedPage.get(s.ctx.savedValue)
              vi.advanceTimersByTime(100)
              const secondReading = s.ctx.reloadedPage.get(s.ctx.savedValue)
              vi.useRealTimers()
              return { firstReading, secondReading }
            }),
        ),
        Then('the reloaded page shows the saved value both times')((s) => {
          expect(s.result.firstReading).toBe(42)
          expect(s.result.secondReading).toBe(42)
        }),
      ),
    )

    scenario(
      'A value that had already finished loading is restored as finished, not restarted, after reload',
      Gherkin.Do.pipe(
        Given('a page with a value that already finished loading, and a short cleanup timer')(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const base = Atom.make(Effect.succeed(123))
              const savedValue = base.pipe(
                Atom.serializable({
                  key: 'k-eff',
                  schema: Result.Schema({ success: Schema.Number }),
                }),
              )
              const page = Registry.make({ defaultIdleTTL: 5 })
              page.get(savedValue)
              const saved = Hydration.dehydrate(page)
              const reloadedPage = Registry.make({ defaultIdleTTL: 5 })
              Hydration.hydrate(reloadedPage, saved)
              return { reloadedPage, savedValue }
            }),
        ),
        When('the value is read on the reloaded page after the cleanup timer runs')(
          'reading',
          (s) =>
            Effect.sync(() => {
              vi.advanceTimersByTime(100)
              const reading = s.ctx.reloadedPage.get(s.ctx.savedValue)
              vi.useRealTimers()
              return reading
            }),
        ),
        Then('the reloaded page shows the value as already finished, with the saved answer')((s) => {
          expect(Result.isSuccess(s.reading) && s.reading.value === 123).toBe(true)
        }),
      ),
    )

    scenario(
      'A value that is still loading when the page is saved automatically fills in once it finishes, even after the page already reloaded',
      Gherkin.Do.pipe(
        Given('a page saved while a value is still loading, reloaded before that value finishes')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const source = yield* Deferred.make<number>()
              const stillLoading = Atom.make(Deferred.await(source)).pipe(
                Atom.serializable({
                  key: 'k-pending',
                  schema: Result.Schema({ success: Schema.Number }),
                }),
              )
              const savedPage = Registry.make()
              savedPage.get(stillLoading)
              const saved = Hydration.dehydrate(savedPage, { encodeInitialAs: 'deferred' })
              const reloadedPage = Registry.make()
              const applied = Hydration.hydrate(reloadedPage, saved)
              return { reloadedPage, stillLoading, source, applied }
            }),
        ),
        When('the reloaded page is read before and after the value finishes loading')(
          'reading',
          (s) =>
            Effect.gen(function*() {
              const beforeItFinishes = s.ctx.reloadedPage.get(s.ctx.stillLoading)
              yield* Deferred.succeed(s.ctx.source, 42)
              yield* Fiber.join(s.ctx.applied)
              const afterItFinishes = s.ctx.reloadedPage.get(s.ctx.stillLoading)
              return { beforeItFinishes, afterItFinishes }
            }),
        ),
        Then('the reloaded page starts out loading, then fills in with the finished answer on its own')((s) => {
          expect(Result.isInitial(s.reading.beforeItFinishes)).toBe(true)
          expect(Result.isSuccess(s.reading.afterItFinishes) && s.reading.afterItFinishes.value === 42).toBe(true)
        }),
      ),
    )

    scenario(
      'A value still loading when the page is saved is left out of the default saved state',
      Gherkin.Do.pipe(
        Given('a page with a still-loading saved value, saved in the default way')('ctx', () =>
          Effect.gen(function*() {
            const source = yield* Deferred.make<number>()
            const stillLoading = Atom.make(Deferred.await(source)).pipe(
              Atom.serializable({
                key: 'k-pending-default',
                schema: Result.Schema({ success: Schema.Number }),
              }),
            )
            const page = Registry.make()
            page.get(stillLoading)
            return { page, stillLoading }
          })),
        When('the page is saved')('saved', (s) => Effect.sync(() => Hydration.dehydrate(s.ctx.page))),
        Then('the still-loading value is not included')((s) => {
          expect(s.saved).toHaveLength(0)
        }),
      ),
    )

    scenario(
      'A still-loading value that is asked to reload while the page is saved still fills in automatically once it finishes',
      Gherkin.Do.pipe(
        Given('a page with a still-loading value, saved so a reloaded page receives it once it finishes')(
          'ctx',
          () =>
            Effect.sync(() => {
              const gate = Atom.make('loading')
              const stillLoading = Atom.readable<Result.Result<number, never>>((get) =>
                get(gate) === 'ready' ? Result.success(42) : Result.initial(true)
              ).pipe(
                Atom.serializable({
                  key: 'k-refresh',
                  schema: Result.Schema({ success: Schema.Number }),
                }),
              )
              const savedPage = Registry.make()
              savedPage.get(stillLoading)
              const saved = Hydration.dehydrate(savedPage, { encodeInitialAs: 'deferred' })
              const reloadedPage = Registry.make()
              const applied = Hydration.hydrate(reloadedPage, saved)
              return { savedPage, reloadedPage, stillLoading, gate, applied }
            }),
        ),
        When(
          'the still-loading value is asked to reload again, then it finishes, and the reloaded page is read before and after',
        )(
          'reading',
          (s) =>
            Effect.gen(function*() {
              const beforeItFinishes = s.ctx.reloadedPage.get(s.ctx.stillLoading)
              s.ctx.savedPage.refresh(s.ctx.stillLoading)
              s.ctx.savedPage.set(s.ctx.gate, 'ready')
              yield* Fiber.join(s.ctx.applied)
              const afterItFinishes = s.ctx.reloadedPage.get(s.ctx.stillLoading)
              return { beforeItFinishes, afterItFinishes }
            }),
        ),
        Then('the reloaded page starts out loading and then fills in with the finished answer on its own')((s) => {
          expect(Result.isInitial(s.reading.beforeItFinishes)).toBe(true)
          expect(Result.isSuccess(s.reading.afterItFinishes) && s.reading.afterItFinishes.value === 42).toBe(true)
        }),
      ),
    )

    scenario(
      'A value that is not marked for saving is left out of the saved state',
      Gherkin.Do.pipe(
        Given('a page holding both a saved value and a plain value')('ctx', () =>
          Effect.sync(() => {
            const savedValue = Atom.make(42).pipe(
              Atom.serializable({
                key: 'k-plain',
                schema: Schema.Number,
              }),
            )
            const plainValue = Atom.make('not saved')
            const page = Registry.make()
            page.get(savedValue)
            page.get(plainValue)
            return { page }
          })),
        When('the page is saved')('saved', (s) => Effect.sync(() => Hydration.dehydrate(s.ctx.page))),
        Then('only the saved value is included')((s) => {
          expect(s.saved).toHaveLength(1)
          expect(s.saved[0]!.key).toBe('k-plain')
          expect(s.saved[0]!.value).toBe(42)
        }),
      ),
    )
  })

import { Atom, Hydration, Registry, Result } from '@systemfsoftware/effect-atom'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Effect, Fiber, Layer, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

Feature("Saving a page's values so a reloaded page starts with them already filled in")
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Ada reloads a saved page and sees her saved count before and after the cleanup timer runs',
      Gherkin.Do.pipe(
        Given('a count saved as 42, with a short cleanup timer')(
          'ctx',
          () =>
            Effect.sync(() => {
              const base = Atom.make(42)
              const savedValue = base.pipe(
                Atom.serializable({
                  key: 'k1',
                  schema: Schema.Finite,
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
        When('Ada reads the count on the reloaded page, then 100 millis pass')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const firstReading = s.ctx.reloadedPage.get(s.ctx.savedValue)
              yield* TestClock.adjust('100 millis')
              const secondReading = s.ctx.reloadedPage.get(s.ctx.savedValue)
              return { firstReading, secondReading }
            }),
        ),
        Then('the reloaded page shows 42 on the first read')((s) => {
          expect(s.result.firstReading).toBe(42)
        }),
        And('it still shows 42 after the cleanup timer runs')((s) => {
          expect(s.result.secondReading).toBe(42)
        }),
      ),
    )
    scenario(
      'Ada reloads a page whose fetch already finished and sees the finished answer, not a restart',
      Gherkin.Do.pipe(
        Given('a fetch that finished with 123, saved with a short cleanup timer')(
          'ctx',
          () =>
            Effect.sync(() => {
              const base = Atom.make(Effect.succeed(123))
              const savedValue = base.pipe(
                Atom.serializable({
                  key: 'k-eff',
                  schema: Result.Schema({ success: Schema.Finite }),
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
        When('Ada waits 100 millis, then reads the value on the reloaded page')(
          'reading',
          (s) =>
            Effect.gen(function*() {
              yield* TestClock.adjust('100 millis')
              const reading = s.ctx.reloadedPage.get(s.ctx.savedValue)
              return reading
            }),
        ),
        Then('the reloaded page shows the fetch already finished with 123')((s) => {
          expect(Result.isSuccess(s.reading) && s.reading.value === 123).toBe(true)
        }),
      ),
    )
    scenario(
      'A value still fetching when Ada saves the page fills in on the reloaded page once the fetch finishes',
      Gherkin.Do.pipe(
        Given('a page Ada saved while its fetch of 42 was still running, already reloaded')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const source = yield* Deferred.make<number>()
              const stillLoading = Atom.make(Deferred.await(source)).pipe(
                Atom.serializable({
                  key: 'k-pending',
                  schema: Result.Schema({ success: Schema.Finite }),
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
        When('Ada checks the reloaded page before and after the fetch finishes with 42')(
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
        Then('the reloaded page starts out still fetching')((s) => {
          expect(Result.isInitial(s.reading.beforeItFinishes)).toBe(true)
        }),
        And('it fills in with 42 on its own once the fetch finishes')((s) => {
          expect(Result.isSuccess(s.reading.afterItFinishes) && s.reading.afterItFinishes.value === 42).toBe(true)
        }),
      ),
    )
    scenario(
      'A value still fetching when Ada saves the page is left out of the default saved state',
      Gherkin.Do.pipe(
        Given('a page holding a saved value that is still fetching')('ctx', () =>
          Effect.gen(function*() {
            const source = yield* Deferred.make<number>()
            const stillLoading = Atom.make(Deferred.await(source)).pipe(
              Atom.serializable({
                key: 'k-pending-default',
                schema: Result.Schema({ success: Schema.Finite }),
              }),
            )
            const page = Registry.make()
            page.get(stillLoading)
            return { page, stillLoading }
          })),
        When('Ada saves the page the default way')('saved', (s) => Effect.sync(() => Hydration.dehydrate(s.ctx.page))),
        Then('the still-fetching value is not in the saved state')((s) => {
          expect(s.saved).toHaveLength(0)
        }),
      ),
    )
    scenario(
      'A value still fetching when Ada saves the page fills in on the reloaded page after she asks for it again',
      Gherkin.Do.pipe(
        Given('a page Ada saved while its fetch of 42 was still running, already reloaded and showing the value')(
          'ctx',
          () =>
            Effect.sync(() => {
              const gate = Atom.make('loading')
              const stillLoading = Atom.readable<Result.Result<number, never>>((get) => {
                if (get(gate) === 'ready') {
                  return Result.success(42)
                }
                return Result.initial(true)
              }).pipe(
                Atom.serializable({
                  key: 'k-refresh',
                  schema: Result.Schema({ success: Schema.Finite }),
                }),
              )
              const savedPage = Registry.make()
              savedPage.get(stillLoading)
              const saved = Hydration.dehydrate(savedPage, { encodeInitialAs: 'deferred' })
              const reloadedPage = Registry.make()
              reloadedPage.mount(stillLoading)
              const applied = Hydration.hydrate(reloadedPage, saved)
              return { savedPage, reloadedPage, stillLoading, gate, applied }
            }),
        ),
        When('Ada asks for the value again and the fetch finishes with 42')(
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
        Then('the reloaded page starts out still fetching')((s) => {
          expect(Result.isInitial(s.reading.beforeItFinishes)).toBe(true)
        }),
        And('it fills in with 42 on its own once the fetch finishes')((s) => {
          expect(Result.isSuccess(s.reading.afterItFinishes) && s.reading.afterItFinishes.value === 42).toBe(true)
        }),
      ),
    )
    scenario(
      'A value Ada never marked for saving is left out of the saved state',
      Gherkin.Do.pipe(
        Given('an open page showing a count saved as 42 and a nickname nobody marked for saving')(
          'ctx',
          () =>
            Effect.sync(() => {
              const savedValue = Atom.make(42).pipe(
                Atom.serializable({
                  key: 'k-plain',
                  schema: Schema.Finite,
                }),
              )
              const plainValue = Atom.make('not saved')
              const page = Registry.make()
              page.mount(savedValue)
              page.mount(plainValue)
              return { page }
            }),
        ),
        When('Ada saves the page')('saved', (s) => Effect.sync(() => Hydration.dehydrate(s.ctx.page))),
        Then('only the count is in the saved state')((s) => {
          expect(s.saved).toHaveLength(1)
          const [entry] = s.saved
          if (entry === undefined) throw new Error('expected one saved value')
          expect(entry.key).toBe('k-plain')
          expect(entry.value).toBe(42)
        }),
      ),
    )
  })

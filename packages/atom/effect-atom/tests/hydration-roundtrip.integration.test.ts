import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as Hydration from '@systemfsoftware/effect-atom/Hydration'
import * as Registry from '@systemfsoftware/effect-atom/Registry'
import * as Result from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Effect, Fiber, Match, Schema } from 'effect'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('A page restores its saved values when it comes back')
  .body(({ scenario }) => {
    const numberStillThere = (s: {
      readonly reloaded: { readonly firstReading: number; readonly secondReading: number }
    }): void => {
      expect(s.reloaded.firstReading).toBe(42)
      expect(s.reloaded.secondReading).toBe(42)
    }

    scenario(
      'A saved number is still there after the page comes back',
      Gherkin.Do.pipe(
        Given('a page holding a saved number')('setup', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const savedValue = Atom.make(42).pipe(
              Atom.serializable({
                key: 'k1',
                schema: Schema.Number,
              }),
            )
            const page = Registry.make({ defaultIdleTTL: 5 })
            page.get(savedValue)
            return { page, savedValue }
          })),
        When('the page is saved and comes back')('reloaded', (s) =>
          Effect.sync(() => {
            const saved = Hydration.dehydrate(s.setup.page)
            const reloadedPage = Registry.make({ defaultIdleTTL: 5 })
            Hydration.hydrate(reloadedPage, saved)
            const firstReading = reloadedPage.get(s.setup.savedValue)
            vi.advanceTimersByTime(100)
            const secondReading = reloadedPage.get(s.setup.savedValue)
            vi.useRealTimers()
            return { firstReading, secondReading }
          })),
        Then('the number is still there, even after the idle timeout')(numberStillThere),
      ),
    )

    const answerIsBack = (s: { readonly reading: Result.Result<number, never> }): void => {
      expect(Result.isSuccess(s.reading)).toBe(true)
      const restored = Match.value(s.reading).pipe(
        Match.when({ _tag: 'Success' }, (success) => success.value),
        Match.orElse(() => -1),
      )
      expect(restored).toBe(123)
    }

    scenario(
      'A finished background value comes back with its answer',
      Gherkin.Do.pipe(
        Given('a page whose background value has already finished')('setup', () =>
          Effect.sync(() => {
            vi.useFakeTimers()
            const savedValue = Atom.make(Effect.succeed(123)).pipe(
              Atom.serializable({
                key: 'k-eff',
                schema: Result.Schema({ success: Schema.Number }),
              }),
            )
            const page = Registry.make({ defaultIdleTTL: 5 })
            page.get(savedValue)
            return { page, savedValue }
          })),
        When('the page is saved, comes back, and time passes')('reading', (s) =>
          Effect.sync(() => {
            const saved = Hydration.dehydrate(s.setup.page)
            const reloadedPage = Registry.make({ defaultIdleTTL: 5 })
            Hydration.hydrate(reloadedPage, saved)
            vi.advanceTimersByTime(100)
            const reading = reloadedPage.get(s.setup.savedValue)
            vi.useRealTimers()
            return reading
          })),
        Then('the answer is back')(answerIsBack),
      ),
    )

    const placeholderThenAnswer = (s: {
      readonly outcome: {
        readonly beforeItFinishes: Result.Result<number, never>
        readonly afterItFinishes: Result.Result<number, never>
      }
    }): void => {
      expect(Result.isInitial(s.outcome.beforeItFinishes)).toBe(true)
      expect(Result.isSuccess(s.outcome.afterItFinishes)).toBe(true)
      const filled = Match.value(s.outcome.afterItFinishes).pipe(
        Match.when({ _tag: 'Success' }, (success) => success.value),
        Match.orElse(() => -1),
      )
      expect(filled).toBe(42)
    }

    scenario(
      'A page that comes back while a value is still loading fills in when it finishes',
      Gherkin.Do.pipe(
        Given('a page saved while its value is still loading')('setup', () =>
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
            return { source, stillLoading, saved }
          })),
        When('the page comes back and the loading value finishes')('outcome', (s) =>
          Effect.gen(function*() {
            const reloadedPage = Registry.make()
            const applied = Hydration.hydrate(reloadedPage, s.setup.saved)
            const beforeItFinishes = reloadedPage.get(s.setup.stillLoading)
            yield* Deferred.succeed(s.setup.source, 42)
            yield* Fiber.join(applied)
            const afterItFinishes = reloadedPage.get(s.setup.stillLoading)
            return { beforeItFinishes, afterItFinishes }
          })),
        Then('the reloaded page showed a placeholder first and now shows the answer')(placeholderThenAnswer),
      ),
    )

    const nothingSaved = (s: { readonly saved: ReadonlyArray<unknown> }): void => {
      expect(s.saved).toHaveLength(0)
    }

    scenario(
      'A page saved while a value is still loading leaves it out by default',
      Gherkin.Do.pipe(
        Given('a page holding a value that is still loading')('setup', () =>
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
            return { page }
          })),
        When('the page is saved with the default settings')(
          'saved',
          (s) => Effect.sync(() => Hydration.dehydrate(s.setup.page)),
        ),
        Then('nothing is saved')(nothingSaved),
      ),
    )

    const refreshedAnswerFillsIn = (s: {
      readonly outcome: {
        readonly beforeItFinishes: Result.Result<number, never>
        readonly afterItFinishes: Result.Result<number, never>
      }
    }): void => {
      expect(Result.isInitial(s.outcome.beforeItFinishes)).toBe(true)
      expect(Result.isSuccess(s.outcome.afterItFinishes)).toBe(true)
      const filled = Match.value(s.outcome.afterItFinishes).pipe(
        Match.when({ _tag: 'Success' }, (success) => success.value),
        Match.orElse(() => -1),
      )
      expect(filled).toBe(42)
    }

    scenario(
      'A page that comes back picks up a value refreshed on the old page',
      Gherkin.Do.pipe(
        Given('a page saved while its value waits on a gate')('setup', () =>
          Effect.sync(() => {
            const gate = Atom.make('loading')
            const stillLoading = Atom.readable((get) =>
              Match.value(get(gate) === 'ready').pipe(
                Match.when(true, () => Result.success(42)),
                Match.orElse(() => Result.initial(true)),
              )
            ).pipe(
              Atom.serializable({
                key: 'k-refresh',
                schema: Result.Schema({ success: Schema.Number }),
              }),
            )
            const savedPage = Registry.make()
            savedPage.get(stillLoading)
            const saved = Hydration.dehydrate(savedPage, { encodeInitialAs: 'deferred' })
            return { gate, stillLoading, savedPage, saved }
          })),
        When('the page comes back and the old page marks the value ready')('outcome', (s) =>
          Effect.gen(function*() {
            const reloadedPage = Registry.make()
            const applied = Hydration.hydrate(reloadedPage, s.setup.saved)
            const beforeItFinishes = reloadedPage.get(s.setup.stillLoading)
            s.setup.savedPage.refresh(s.setup.stillLoading)
            s.setup.savedPage.set(s.setup.gate, 'ready')
            yield* Fiber.join(applied)
            const afterItFinishes = reloadedPage.get(s.setup.stillLoading)
            return { beforeItFinishes, afterItFinishes }
          })),
        Then('the reloaded page showed a placeholder first and now shows the answer')(refreshedAnswerFillsIn),
      ),
    )

    const onlyKeepableSaved = (
      s: { readonly saved: ReadonlyArray<{ readonly key: string; readonly value: unknown }> },
    ): void => {
      expect(s.saved).toHaveLength(1)
      expect(s.saved[0].key).toBe('k-plain')
      expect(s.saved[0].value).toBe(42)
    }

    scenario(
      'A page with mixed values saves only the ones marked to keep',
      Gherkin.Do.pipe(
        Given('a page holding a keepable number and an ordinary note')('setup', () =>
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
        When('the page is saved')('saved', (s) => Effect.sync(() => Hydration.dehydrate(s.setup.page))),
        Then('only the keepable number is in the saved state')(onlyKeepableSaved),
      ),
    )
  })

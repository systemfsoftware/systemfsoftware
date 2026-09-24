import { Atom, Hydration, Registry, Result } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Deferred, Effect, Fiber, Layer, Schema } from 'effect'
import { expect, vi } from 'vitest'
import { SavedText } from './__fixtures__/SavedText.schema.js'

const Feature = makeFeature({ it, layer })

const throughText = (saved: ReadonlyArray<Hydration.DehydratedAtomValue>) =>
  Schema.encodeUnknownEffect(SavedText)(saved).pipe(
    Effect.flatMap((text) => Schema.decodeEffect(SavedText)(text).pipe(Effect.map((copy) => ({ text, copy })))),
    Effect.orDie,
  )

Feature("Saving a page's values so a reloaded page starts with them already filled in")
  .withLayer(Layer.empty)
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
                  schema: Schema.Finite,
                }),
              )
              const page = Registry.make({ defaultIdleTTL: 5 })
              Registry.get(page, savedValue)
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
              const firstReading = Registry.get(s.ctx.reloadedPage, s.ctx.savedValue)
              vi.advanceTimersByTime(100)
              const secondReading = Registry.get(s.ctx.reloadedPage, s.ctx.savedValue)
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
                  schema: Result.Schema({ success: Schema.Finite }),
                }),
              )
              const page = Registry.make({ defaultIdleTTL: 5 })
              Registry.get(page, savedValue)
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
              const reading = Registry.get(s.ctx.reloadedPage, s.ctx.savedValue)
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
                  schema: Result.Schema({ success: Schema.Finite }),
                }),
              )
              const savedPage = Registry.make()
              Registry.get(savedPage, stillLoading)
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
              const beforeItFinishes = Registry.get(s.ctx.reloadedPage, s.ctx.stillLoading)
              yield* Deferred.succeed(s.ctx.source, 42)
              yield* Fiber.join(s.ctx.applied)
              const afterItFinishes = Registry.get(s.ctx.reloadedPage, s.ctx.stillLoading)
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
                schema: Result.Schema({ success: Schema.Finite }),
              }),
            )
            const page = Registry.make()
            Registry.get(page, stillLoading)
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
              Registry.get(savedPage, stillLoading)
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
              const beforeItFinishes = Registry.get(s.ctx.reloadedPage, s.ctx.stillLoading)
              Registry.refresh(s.ctx.savedPage, s.ctx.stillLoading)
              Registry.set(s.ctx.savedPage, s.ctx.gate, 'ready')
              yield* Fiber.join(s.ctx.applied)
              const afterItFinishes = Registry.get(s.ctx.reloadedPage, s.ctx.stillLoading)
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
                schema: Schema.Finite,
              }),
            )
            const plainValue = Atom.make('not saved')
            const page = Registry.make()
            Registry.get(page, savedValue)
            Registry.get(page, plainValue)
            return { page }
          })),
        When('the page is saved')('saved', (s) => Effect.sync(() => Hydration.dehydrate(s.ctx.page))),
        Then('only the saved value is included')((s) => {
          expect(s.saved).toHaveLength(1)
          const [entry] = s.saved
          if (entry === undefined) throw new Error('expected one saved value')
          expect(entry.key).toBe('k-plain')
          expect(entry.value).toBe(42)
        }),
      ),
    )
    scenario(
      'A saved number that breaks the page rule is noted and the page computes its own number',
      Gherkin.Do.pipe(
        Given('a page whose saved number must stay above zero')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(7).pipe(
              Atom.serializable({
                key: 'count-above-zero',
                schema: Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0))),
              }),
            )
            const page = Registry.make()
            return { page, count }
          })),
        When('a saved payload arrives carrying a negative number for it')('result', (s) =>
          Effect.sync(() => {
            Hydration.hydrate(s.ctx.page, [{
              '~effect/reactivity/DehydratedAtom': true,
              key: 'count-above-zero',
              value: -5,
              dehydratedAt: 1,
            }])
            return {
              reading: Registry.get(s.ctx.page, s.ctx.count),
              notes: Registry.refusals(s.ctx.page),
            }
          })),
        Then('one note names the number and the broken rule, and the page shows its own number')((s) => {
          expect(s.result.reading).toBe(7)
          expect(s.result.notes).toHaveLength(1)
          const [note] = s.result.notes
          if (note === undefined) throw new Error('expected one refusal note')
          expect(note.key).toBe('count-above-zero')
          expect(note.issue).toContain('greater than')
        }),
      ),
    )
    scenario(
      'A number that breaks its saving rule is noted and left out of the saved state',
      Gherkin.Do.pipe(
        Given('a page holding a zero where the saved number must stay above zero, next to a valid saved word')(
          'ctx',
          () =>
            Effect.sync(() => {
              const count = Atom.make(0).pipe(
                Atom.serializable({
                  key: 'count-must-be-positive',
                  schema: Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0))),
                }),
              )
              const label = Atom.make('hello').pipe(Atom.serializable({ key: 'label', schema: Schema.String }))
              const page = Registry.make()
              Registry.get(page, count)
              Registry.get(page, label)
              return { page }
            }),
        ),
        When('the page is saved')('result', (s) =>
          Effect.sync(() => ({
            saved: Hydration.dehydrate(s.ctx.page).map((entry) => entry.key),
            notes: Registry.refusals(s.ctx.page),
          }))),
        Then('only the valid word is saved and the broken number is noted by name')((s) => {
          expect(s.result.saved).toEqual(['label'])
          expect(s.result.notes.map((note) => note.key)).toEqual(['count-must-be-positive'])
        }),
      ),
    )
    scenario(
      'A garbled word for one saved number is noted while the good number next to it still loads',
      Gherkin.Do.pipe(
        Given('a page holding two saved numbers')('ctx', () =>
          Effect.sync(() => {
            const first = Atom.make(1).pipe(
              Atom.serializable({ key: 'first-number', schema: Schema.Finite }),
            )
            const second = Atom.make(2).pipe(
              Atom.serializable({ key: 'second-number', schema: Schema.Finite }),
            )
            const page = Registry.make()
            return { page, first, second }
          })),
        When('a saved payload arrives with a word for the first and a number for the second')(
          'result',
          (s) =>
            Effect.sync(() => {
              Hydration.hydrate(s.ctx.page, [
                {
                  '~effect/reactivity/DehydratedAtom': true,
                  key: 'first-number',
                  value: 'invalid',
                  dehydratedAt: 1,
                },
                {
                  '~effect/reactivity/DehydratedAtom': true,
                  key: 'second-number',
                  value: 9,
                  dehydratedAt: 1,
                },
              ])
              return {
                firstReading: Registry.get(s.ctx.page, s.ctx.first),
                secondReading: Registry.get(s.ctx.page, s.ctx.second),
                notes: Registry.refusals(s.ctx.page),
              }
            }),
        ),
        Then('the garbled entry is noted and the good number still loads')((s) => {
          expect(s.result.firstReading).toBe(1)
          expect(s.result.secondReading).toBe(9)
          expect(s.result.notes).toHaveLength(1)
          const [note] = s.result.notes
          if (note === undefined) throw new Error('expected one refusal note')
          expect(note.key).toBe('first-number')
        }),
      ),
    )
    scenario(
      'A saved entry with no name is turned away before it can reach the page',
      Gherkin.Do.pipe(
        Given('a page with a saved number')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(3).pipe(
              Atom.serializable({ key: 'named-number', schema: Schema.Finite }),
            )
            const page = Registry.make()
            return { page, count }
          })),
        When('a saved payload arrives with an entry missing its name')('result', (s) =>
          Effect.sync(() => {
            const nameless: Hydration.HydrationEntry = {
              '~effect/reactivity/DehydratedAtom': true,
              value: 9,
              dehydratedAt: 1,
            }
            Hydration.hydrate(s.ctx.page, [nameless])
            return {
              reading: Registry.get(s.ctx.page, s.ctx.count),
              notes: Registry.refusals(s.ctx.page),
            }
          })),
        Then('the nameless entry is noted without a name and the page is untouched')((s) => {
          expect(s.result.reading).toBe(3)
          expect(s.result.notes).toHaveLength(1)
          const [note] = s.result.notes
          if (note === undefined) throw new Error('expected one refusal note')
          expect(note.key).toBeUndefined()
        }),
      ),
    )
    scenario(
      'A saved loading value carries no hidden machinery through a text copy, yet still fills in from the live page',
      Gherkin.Do.pipe(
        Given('a page saved while a value is still loading')('ctx', () =>
          Effect.gen(function*() {
            const source = yield* Deferred.make<number>()
            const stillLoading = Atom.make(Deferred.await(source)).pipe(
              Atom.serializable({
                key: 'k-text-copy',
                schema: Result.Schema({ success: Schema.Finite }),
              }),
            )
            const savedPage = Registry.make()
            Registry.get(savedPage, stillLoading)
            const saved = Hydration.dehydrate(savedPage, { encodeInitialAs: 'deferred' })
            return { savedPage, stillLoading, source, saved }
          })),
        When('the saved state travels through a text copy onto a reloaded page')(
          'reading',
          (s) =>
            Effect.gen(function*() {
              const { text } = yield* throughText(s.ctx.saved)
              const reloadedPage = Registry.make()
              const applied = Hydration.hydrate(reloadedPage, s.ctx.saved)
              const beforeItFinishes = Registry.get(reloadedPage, s.ctx.stillLoading)
              yield* Deferred.succeed(s.ctx.source, 42)
              yield* Fiber.join(applied)
              const afterItFinishes = Registry.get(reloadedPage, s.ctx.stillLoading)
              return { text, beforeItFinishes, afterItFinishes }
            }),
        ),
        Then('the text copy hides the machinery and the reloaded page still fills in')((s) => {
          expect(s.reading.text).not.toContain('Deferred')
          expect(Result.isInitial(s.reading.beforeItFinishes)).toBe(true)
          expect(Result.isSuccess(s.reading.afterItFinishes) && s.reading.afterItFinishes.value === 42).toBe(true)
        }),
      ),
    )
    scenario(
      'A finished loading value survives a text copy round trip with its answer intact',
      Gherkin.Do.pipe(
        Given('a page with a value that already finished loading')('ctx', () =>
          Effect.sync(() => {
            const finished = Atom.make(Effect.succeed(123)).pipe(
              Atom.serializable({
                key: 'k-round-trip',
                schema: Result.Schema({ success: Schema.Finite }),
              }),
            )
            const page = Registry.make()
            Registry.get(page, finished)
            return { page, finished }
          })),
        When('the saved state travels through a text copy onto a reloaded page')(
          'reading',
          (s) =>
            throughText(Hydration.dehydrate(s.ctx.page)).pipe(
              Effect.map(({ copy }) => {
                const reloadedPage = Registry.make()
                Hydration.hydrate(reloadedPage, copy)
                return Registry.get(reloadedPage, s.ctx.finished)
              }),
            ),
        ),
        Then('the reloaded page shows the value as already finished, with the saved answer')((s) => {
          expect(Result.isSuccess(s.reading) && s.reading.value === 123).toBe(true)
        }),
      ),
    )
  })

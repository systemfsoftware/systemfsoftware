import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Deferred, Effect, Fiber, Layer, Match, Option, Ref, Schema } from 'effect'

import { HydrationCommand, hydrationModel } from './__fixtures__/hydration.model.js'

/** The budget the sequential check is given: every one of these histories is checked. */
const HYDRATION_ROUNDS = 50

const Feature = makeFeature({ it })

interface HydrationPages {
  readonly savedPage: Atom.Registry.Registry
  readonly reloadedPage: Atom.Registry.Registry
  readonly source: Deferred.Deferred<number>
  readonly stillLoading: Atom.Atom<Atom.AsyncResult.Result<number, never>>
  readonly saved: Ref.Ref<Option.Option<ReadonlyArray<Atom.Hydration.DehydratedAtomValue>>>
  readonly applied: Ref.Ref<Option.Option<Fiber.Fiber<void, never>>>
}

class Pages extends Context.Service<Pages, HydrationPages>()(
  '@systemfsoftware/effect-atom/tests/hydration.conformance.test/Pages',
) {}

const pagesLayer: Layer.Layer<Pages> = Layer.effect(
  Pages,
  Effect.gen(function*() {
    const source = Deferred.makeUnsafe<number>()
    const stillLoading = Atom.make(Deferred.await(source)).pipe(
      Atom.serializable({
        key: 'k-pending',
        schema: Atom.AsyncResult.Schema({ success: Schema.Finite }),
      }),
    )
    const savedPage = Atom.Registry.make()
    Atom.Registry.subscribe(savedPage, stillLoading, () => {})
    const saved = yield* Ref.make(Option.none<ReadonlyArray<Atom.Hydration.DehydratedAtomValue>>())
    const applied = yield* Ref.make(Option.none<Fiber.Fiber<void, never>>())
    return { savedPage, reloadedPage: Atom.Registry.make(), source, stillLoading, saved, applied }
  }),
).pipe(Layer.orDie)

const shownBy = (handle: HydrationPages): ReadonlyArray<number> => {
  const result = Atom.Registry.get(handle.reloadedPage, handle.stillLoading)
  return Atom.AsyncResult.isSuccess(result) ? [result.value] : []
}

const runHydrationCommand = (
  command: HydrationCommand,
): Effect.Effect<ReadonlyArray<number> | undefined, never, Pages> =>
  Effect.flatMap(Pages, (handle) =>
    Match.value(command).pipe(
      Match.tagsExhaustive({
        Save: () =>
          Effect.gen(function*() {
            const entries = Atom.Hydration.dehydrate(handle.savedPage, { encodeInitialAs: 'deferred' })
            yield* Ref.set(handle.saved, Option.some(entries))
            return [entries.length]
          }),
        Reload: () =>
          Effect.gen(function*() {
            const entries = Option.getOrThrow(yield* Ref.get(handle.saved))
            const pending = Atom.Hydration.hydrate(handle.reloadedPage, entries)
            yield* Ref.set(handle.applied, Option.some(pending))
            return undefined
          }),
        Resolve: () =>
          Effect.gen(function*() {
            yield* Deferred.succeed(handle.source, 42)
            const pending = Option.getOrThrow(yield* Ref.get(handle.applied))
            yield* Fiber.join(pending)
            return shownBy(handle)
          }),
        Read: () => Effect.sync(() => shownBy(handle)),
      }),
    ))

const hydrationCheck = (
  subject: Layer.Layer<Pages>,
  spec: { readonly sequences: number; readonly operations: number },
) =>
  Conformance.sequential(subject, {
    commands: HydrationCommand,
    model: hydrationModel,
    run: runHydrationCommand,
    sequences: spec.sequences,
    operations: spec.operations,
  })

Feature('Saving a still-loading value and filling it in on a reloaded page', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A page saved while a value is still loading shows it loading, then fills it in once it finishes',
      Gherkin.Do.pipe(
        Given('a page holding a value that is still loading, and a page to reload it into')(
          'subject',
          () => Effect.succeed(pagesLayer),
        ),
        When('fifty rounds of saving, reloading, finishing the value, and reading it are replayed')(
          'report',
          (s) => hydrationCheck(s.subject, { sequences: HYDRATION_ROUNDS, operations: 8 }),
        ),
        Then('the reloaded page shows the value loading until it finishes, then shows the finished value')((
          s,
          expect,
        ) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({ _tag: 'Pass', histories: HYDRATION_ROUNDS })
        ),
      ),
    )
  })

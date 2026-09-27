import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Ref } from 'effect'
import type * as Scope from 'effect/Scope'
import * as React from 'react'
import { renderToString } from 'react-dom/server'

const Feature = makeFeature({ it })

interface ScopedBox {
  readonly live: Ref.Ref<number>
  readonly started: Ref.Ref<number>
  readonly created: number
  readonly distinct: boolean
}

interface ScopedWorld {
  box: ScopedBox | undefined
}

const scopedWorld = (): ScopedWorld => ({ box: undefined })

const running = (
  live: Ref.Ref<number>,
  started: Ref.Ref<number>,
  input: number,
): Effect.Effect<number, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.andThen(
      Ref.update(started, (count) => count + 1),
      Ref.update(live, (count) => count + 1),
    ),
    () => Ref.update(live, (count) => count - 1),
  ).pipe(Effect.andThen(Effect.never), Effect.as(input))

const runAtom = (
  live: Ref.Ref<number>,
  started: Ref.Ref<number>,
): Atom.AtomResultFn<number, number, never> =>
  Atom.fn((input: number) => running(live, started, input), { concurrent: true })

const mountedOnce = (
  registry: Atom.Registry.Registry,
  atom: Atom.AtomResultFn<number, number, never>,
): () => void => {
  const release = Atom.Registry.subscribe(registry, atom, () => {}, { immediate: true })
  Atom.Registry.set(registry, atom, 1)
  return release
}

const scopedProgram = (world: ScopedWorld): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const started = yield* Ref.make(0)
    const live = yield* Ref.make(0)
    const created: Array<Atom.AtomResultFn<number, number, never>> = []
    const Scoped = AtomReact.make(() => {
      const atom = runAtom(live, started)
      created.push(atom)
      return atom
    })
    yield* Effect.sync(() => {
      renderToString(React.createElement(Scoped.Provider, null, null))
      renderToString(React.createElement(Scoped.Provider, null, null))
    })
    const registry = Atom.Registry.make()
    const releases = yield* Effect.sync(() => created.map((atom) => mountedOnce(registry, atom)))
    yield* Effect.yieldNow
    yield* Effect.sync(() => {
      releases.forEach((release) => release())
    })
    world.box = {
      live,
      started,
      created: created.length,
      distinct: created.length === 2 && created[0] !== created[1],
    }
  })

const broke = (message: string): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.fail(Conformance.RuleBroken.make({ message }))

const scopedRule = (world: ScopedWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.gen(function*() {
    const box = world.box
    if (box === undefined) {
      return yield* broke('no run of the scoped atom was observed')
    }
    if (box.created !== 2) {
      return yield* broke(`the two owners created ${box.created} atom(s), not one each`)
    }
    if (!box.distinct) {
      return yield* broke('the two owners shared one atom')
    }
    const started = yield* Ref.get(box.started)
    if (started < 2) {
      return yield* broke(`the owners started ${started} run(s), so the unmount proves nothing`)
    }
    const live = yield* Ref.get(box.live)
    return live === 0 ? undefined : yield* broke(`unmounting the owners left ${live} fiber(s) running`)
  })

Feature('A scoped atom whose React owners unmount stops the fibers it started', { timeout: 0 })
  .live('renders real components with react-dom/server and drives the simulation kernel itself')
  .body(({ scenario }) => {
    scenario(
      'Each owner unmounting interrupts the fibers of its own atom',
      Gherkin.Do.pipe(
        Given('a world a scoped atom run can record its outcome into')('world', () => Effect.succeed(scopedWorld)),
        When('two owners mount and unmount their atoms, stopped at every step')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: AtomReact.make,
              world: Effect.sync(s.world),
              program: scopedProgram,
              restart: scopedProgram,
              rule: scopedRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('every atom the owners created has no fiber left running')((s, expect) =>
          expect({ report: s.checked }, Conformance.render(s.checked)).toMatchObject({ report: { _tag: 'Pass' } })
        ),
      ),
    )
  })

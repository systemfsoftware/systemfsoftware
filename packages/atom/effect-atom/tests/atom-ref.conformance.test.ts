import { Conformance } from '@systemfsoftware/conformance-spec'
import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect } from 'effect'

const Feature = makeFeature({ it })

interface RefObservation {
  readonly heard: ReadonlyArray<number>
  readonly value: number
}

interface RefWorld {
  last: RefObservation | undefined
}

const refWorld = (): RefWorld => ({ last: undefined })

const refProgram = (world: RefWorld): Effect.Effect<void> =>
  Effect.sync(() => {
    const ref = Atom.Ref.make(0)
    const heard: number[] = []
    const release = Atom.Ref.subscribe(ref, (value) => {
      heard.push(value)
    })
    Atom.Ref.set(ref, 1)
    release()
    Atom.Ref.set(ref, 2)
    world.last = { heard, value: Atom.Ref.get(ref) }
  })

const brokeRule = (message: string): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.fail(Conformance.RuleBroken.make({ message }))

const refRule = (world: RefWorld): Effect.Effect<void, Conformance.RuleBroken> => {
  const last = world.last
  if (last === undefined) {
    return brokeRule('no run of the reference was observed')
  }
  if (last.heard.length !== 1 || last.heard[0] !== 1) {
    return brokeRule(`a subscriber that let go still heard ${JSON.stringify(last.heard)}`)
  }
  return last.value === 2
    ? Effect.void
    : brokeRule(`expected the reference to read 2 after the subscriber let go, got ${last.value}`)
}

Feature('A reference stops notifying a subscriber once it lets go', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A released subscriber hears nothing after it lets go',
      Gherkin.Do.pipe(
        Given('a mutable reference whose subscriber records every value it hears')(
          'world',
          () => Effect.succeed(refWorld),
        ),
        When('the reference is stopped at every step after the subscriber is set and let go')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Atom.Ref.make,
              world: Effect.sync(s.world),
              program: refProgram,
              restart: refProgram,
              rule: refRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('no value reaches a subscriber that has let go')((s, expect) =>
          expect({ report: s.checked }, Conformance.render(s.checked)).toMatchObject({ report: { _tag: 'Pass' } })
        ),
      ),
    )
  })

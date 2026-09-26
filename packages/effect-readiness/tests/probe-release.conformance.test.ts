import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Duration, Effect, Schema } from 'effect'
import {
  hostProberOver,
  leftOpen,
  type ProbeWorld,
  probeWorld,
  probingProcess,
} from './__fixtures__/probe-world.fixture.js'

const Feature = makeFeature({ it })

const GUEST_PORT = 8080
const HEALTH_PATH = '/health'
const HEALTH_WAIT = { timeoutMs: 1_000, pollMs: 50 } as const

const target = Readiness.target([{ guest: GUEST_PORT, host: '127.0.0.1', hostPort: 49_100 }], HEALTH_WAIT)

const ruleFrom = (message: string | undefined): Effect.Effect<void, Conformance.RuleBroken> =>
  message === undefined ? Effect.void : Effect.fail(new Conformance.RuleBroken({ message }))

const nothingLeftOpen = (world: ProbeWorld): Effect.Effect<void, Conformance.RuleBroken> => ruleFrom(leftOpen(world))

const tcpWaitOf = (world: ProbeWorld) =>
  probingProcess(world)(Effect.provide(target.awaitCondition(Readiness.Wait.forTcp(GUEST_PORT)), hostProberOver(world)))

const httpWaitOf = (world: ProbeWorld) =>
  probingProcess(
    world,
  )(Effect.provide(target.awaitCondition(Readiness.Wait.forHttp(HEALTH_PATH, GUEST_PORT)), hostProberOver(world)))

const freshWorlds = (): { readonly seen: Array<ProbeWorld>; readonly world: Effect.Effect<ProbeWorld> } => {
  const seen: Array<ProbeWorld> = []
  return {
    seen,
    world: Effect.tap(probeWorld, (fresh) =>
      Effect.sync(() => {
        seen.push(fresh)
      })),
  }
}

const dials = (seen: ReadonlyArray<ProbeWorld>): number =>
  seen.reduce((count, world) => count + world.runs.reduce((total, run) => total + run.dials, 0), 0)

Feature('Stopping a readiness wait at every step closes every probe connection', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A wait stopped while its connection is open leaves nothing open on the host socket',
      Gherkin.Do.pipe(
        Given('a world that records every connection a wait opens on the host socket')(
          'world',
          () => Effect.succeed(freshWorlds()),
        ),
        When('a TCP wait opens a connection, is stopped at every step, and is started again on the same world')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Readiness.target,
              world: s.world.world,
              program: tcpWaitOf,
              restart: tcpWaitOf,
              rule: nothingLeftOpen,
              stopWithin: Duration.zero,
            }),
        ),
        Then('every cut passes and the waits that ended probed the socket')((state, expect) =>
          expect({
            report: state.checked,
            rendered: Conformance.render(state.checked),
            dials: dials(state.world.seen),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            rendered: expect.stringContaining('every stop cut passed'),
            dials: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A wait stopped while its health exchange is in flight leaves nothing open on the host socket',
      Gherkin.Do.pipe(
        Given('a world that records every connection a wait opens on the host socket')(
          'world',
          () => Effect.succeed(freshWorlds()),
        ),
        When('an HTTP wait exchanges a request, is stopped at every step, and is started again on the same world')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Readiness.target,
              world: s.world.world,
              program: httpWaitOf,
              restart: httpWaitOf,
              rule: nothingLeftOpen,
              stopWithin: Duration.zero,
            }),
        ),
        Then('every cut passes and the waits that ended probed the socket')((state, expect) =>
          expect({
            report: state.checked,
            rendered: Conformance.render(state.checked),
            dials: dials(state.world.seen),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            rendered: expect.stringContaining('every stop cut passed'),
            dials: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })

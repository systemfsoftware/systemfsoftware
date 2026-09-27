import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Fiber, Layer, Result, type Scope } from 'effect'
import { type LawCase, probeStopLaws, type ProbeStopSubject } from './__fixtures__/probe-stop-laws.fixture.js'
import {
  holdingProberOver,
  hostProberOver,
  type ProbeWorld,
  probeWorld,
  probingProcess,
} from './__fixtures__/probe-world.fixture.js'

const Feature = makeFeature({ it })

const GUEST_PORT = 8080
const HEALTH_PATH = '/health'
const BINDING: Readiness.PortBinding = { guest: GUEST_PORT, host: '127.0.0.1', hostPort: 49_100 }

const endedRunsOf = (world: ProbeWorld) => {
  const ended = world.runs.filter((run) => run.ended)
  return { ended: ended.length, leftOpen: ended.reduce((total, run) => total + run.open.length, 0) }
}

const abandonMidCall: ProbeStopSubject['kill'] = () => Effect.void

const letTheRunGo: ProbeStopSubject['release'] = (fiber) => Effect.asVoid(Fiber.interrupt(fiber))

const fakeSubject = (world: ProbeWorld): ProbeStopSubject => {
  const answering = hostProberOver(world)
  const holding = holdingProberOver(world)
  return {
    dial: Effect.provide(
      Effect.flatMap(Readiness.HostProber, (prober) => prober.dial(BINDING)),
      answering,
    ),
    exchange: Effect.provide(
      Effect.flatMap(Readiness.HostProber, (prober) => prober.exchange(BINDING, HEALTH_PATH)),
      answering,
    ),
    inFlight: Effect.provide(
      Effect.flatMap(Readiness.HostProber, (prober) => prober.exchange(BINDING, HEALTH_PATH)),
      holding,
    ),
    run: (body) => Effect.scoped(probingProcess(world)(body)),
    kill: abandonMidCall,
    release: letTheRunGo,
    heldOpen: Effect.sync(() => world.runs.reduce((total, run) => total + run.open.length, 0)),
    endedRuns: Effect.sync(() => endedRunsOf(world)),
  }
}

const fakeSubjects: Effect.Effect<ProbeStopSubject, never, Scope.Scope> = Effect.map(probeWorld, fakeSubject)

const [ordinaryRun, stoppedInFlight, restartedAfterStop, killedMidCall] = probeStopLaws(fakeSubjects)

const verdictOf = (law: LawCase): Effect.Effect<string> =>
  Effect.map(
    Effect.result(law.check),
    (outcome) =>
      Result.match(outcome, {
        onFailure: (failure) => `${failure.law}: broken — ${failure.why}`,
        onSuccess: () => 'holds',
      }),
  )

const lawPipeline = (event: string, law: LawCase) =>
  Gherkin.Do.pipe(
    When(event)('verdict', () => verdictOf(law)),
    Then('the law holds for the fake host socket world')((state, expect) => expect(state.verdict).toEqual('holds')),
  )

Feature('The fake host socket world obeys the probe stop laws')
  .live('the laws fork and interrupt fibers and wait on the real clock, which a kernel run cannot observe')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An ordinary run answers on the live endpoint and leaves nothing open',
      lawPipeline('a wait dials and exchanges with the endpoint behind the mapped port', ordinaryRun),
    )

    scenario(
      'A run stopped while its call is in flight leaves nothing open',
      lawPipeline('a wait is stopped while its exchange with the endpoint is in flight', stoppedInFlight),
    )

    scenario(
      'A run started after a stop still answers on the live endpoint',
      lawPipeline('a wait is started again on the same world after a stop', restartedAfterStop),
    )

    scenario(
      'A run killed mid-call is not blamed and the endpoint lets it go',
      lawPipeline('a wait is killed while its exchange with the endpoint is in flight', killedMidCall),
    )
  })

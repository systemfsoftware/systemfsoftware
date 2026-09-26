import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Conformance } from '@systemfsoftware/conformance-spec'
import type { Conformance as Medium } from '@systemfsoftware/effect-daemon-conformance'
import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { ConfigProvider, Crypto, Duration, Effect, Layer, Scope, Stream } from 'effect'
import { FIXTURE_IMAGE, READY_TOKEN } from './__fixtures__/child-script.js'
import { microvmSandboxRuntime, type SandboxBehaviour, SandboxLedger } from './__fixtures__/microvm-runtime.fixture.js'

const Feature = makeFeature({ it })

const driver = MicroVMMedium.conformanceDriver(
  MicroVMMedium.MicroVMWorkload.make({
    image: FIXTURE_IMAGE,
    command: ['sh', '-c', ':'],
    readyOnStdout: READY_TOKEN,
  }),
)

const STOP_MILLIS = 100

const STEP_WINDOW = '5 millis'

const becomeReady: Medium.ChildStep = { _tag: 'BecomeReady' }

const exitNormal: Medium.ChildStep = { _tag: 'ExitNormal' }

const quietWorkload = MicroVMMedium.MicroVMWorkload.make({ image: FIXTURE_IMAGE, command: ['sh', '-c', ':'] })

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

const fakePlatform = (behaviour: SandboxBehaviour) =>
  Layer.mergeAll(
    Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: () => Effect.succeed(new Uint8Array()),
      }),
    ),
    Layer.succeed(Readiness.HostProber, {
      dial: () => Effect.succeed({ _tag: 'Connected' as const }),
      exchange: () => Effect.succeed({ _tag: 'Refused' as const }),
    }),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PLATFORM: 'darwin', ARCH: 'arm64' } })),
    nodeFileSystemLayer,
    microvmSandboxRuntime(behaviour),
  )

const bootWorld = (behaviour: SandboxBehaviour) =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    return yield* Layer.buildWithScope(Layer.merge(MicroVMMedium.layer(), fakePlatform(behaviour)), scope)
  })

const recordStop: Effect.Effect<void, never, SandboxLedger> = Effect.gen(function*() {
  const ledger = yield* Effect.service(SandboxLedger)
  yield* ledger.recordStop((yield* ledger.outstanding).length)
})

const superviseScriptedChild = Effect.gen(function*() {
  const launched = yield* driver.launch('worker', [])
  yield* launched.control.advance(becomeReady, 0)
  const { medium } = yield* MicroVMMedium.port
  const evidence = yield* medium.start(launched.program)
  yield* Effect.sleep(STEP_WINDOW)
  yield* launched.control.advance(exitNormal, 0)
  yield* Effect.sleep(STEP_WINDOW)
  yield* medium.stop(evidence, { _tag: 'Graceful', millis: STOP_MILLIS })
  yield* recordStop
  yield* Effect.asVoid(medium.report(evidence))
})

const superviseDrainingChild = Effect.gen(function*() {
  const { medium } = yield* MicroVMMedium.port
  const evidence = yield* medium.start({ workload: quietWorkload, stdin: Stream.empty })
  yield* Effect.sleep(STEP_WINDOW)
  yield* medium.stop(evidence, { _tag: 'Graceful', millis: STOP_MILLIS })
  yield* recordStop
  yield* Effect.asVoid(medium.report(evidence))
})

/** A live session that never reports an exit: only the stop ends it, and no exit event ever arrives. */
const superviseSilentChild = Effect.gen(function*() {
  const launched = yield* driver.launch('worker', [])
  const { medium } = yield* MicroVMMedium.port
  const evidence = yield* medium.start(launched.program)
  yield* Effect.sleep(STEP_WINDOW)
  yield* medium.stop(evidence, { _tag: 'Graceful', millis: STOP_MILLIS })
  yield* recordStop
  yield* Effect.asVoid(medium.report(evidence))
})

const leftBehind = (
  outstanding: ReadonlyArray<string>,
  started: number,
  stops: ReadonlyArray<number>,
): string | undefined => {
  if (outstanding.length > 0) {
    return `${outstanding.length} virtual machine(s) left behind after the stop: ${outstanding.join(', ')}`
  }
  if (started === 0) return 'the run never booted a machine'
  const stopped = stops[stops.length - 1]
  return stopped === 0
    ? undefined
    : `the stop itself left ${stopped ?? 'an unknown number of'} virtual machine(s) standing`
}

const microvmRule: Effect.Effect<void, Conformance.RuleBroken, SandboxLedger> = Effect.gen(function*() {
  const ledger = yield* Effect.service(SandboxLedger)
  const message = leftBehind(yield* ledger.outstanding, yield* ledger.started, yield* ledger.stops)
  return yield* message === undefined ? Effect.void : Conformance.RuleBroken.make({ message })
})

Feature('Supervising a workload in a microVM until the scope that owns it closes', { timeout: 0 })
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A workload that announces readiness and then exits cleanly leaves no virtual machine behind once the supervision is stopped at any step',
      Gherkin.Do.pipe(
        Given('a microVM medium bound to a sandbox runtime that runs the workload script in process')(
          'behaviour',
          () => Effect.succeed('waits-for-steps' as const),
        ),
        When('the workload is supervised and the supervision is stopped at every step')(
          'checked',
          (s) => {
            const world = bootWorld(s.behaviour)
            return Conformance.stopped({
              unit: MicroVMMedium.port,
              world,
              program: (built) => Effect.provide(superviseScriptedChild, built),
              restart: (built) =>
                Effect.provide(
                  Effect.andThen(
                    Effect.flatMap(Effect.service(SandboxLedger), (ledger) => ledger.restarted),
                    Effect.provide(superviseScriptedChild, built),
                  ),
                  built,
                ),
              rule: (built) => Effect.provide(microvmRule, built),
              stopWithin: Duration.zero,
            })
          },
        ),
        Then('every stop left no virtual machine behind and the workload was reported as a normal termination')(
          (state, expect) =>
            expect({ report: state.checked }, Conformance.render(state.checked)).toMatchObject({
              report: { _tag: 'Pass' },
            }),
        ),
      ),
    )

    scenario(
      'A workload whose session ends without reporting an exit leaves nothing behind once the supervision is stopped at any step',
      Gherkin.Do.pipe(
        Given('a microVM medium bound to a sandbox runtime whose workload session ends without reporting an exit')(
          'behaviour',
          () => Effect.succeed('ends-after-started' as const),
        ),
        When('the workload is supervised and the supervision is stopped at every step')(
          'checked',
          (s) => {
            const world = bootWorld(s.behaviour)
            return Conformance.stopped({
              unit: MicroVMMedium.port,
              world,
              program: (built) => Effect.provide(superviseDrainingChild, built),
              restart: (built) =>
                Effect.provide(
                  Effect.andThen(
                    Effect.flatMap(Effect.service(SandboxLedger), (ledger) => ledger.restarted),
                    Effect.provide(superviseDrainingChild, built),
                  ),
                  built,
                ),
              rule: (built) => Effect.provide(microvmRule, built),
              stopWithin: Duration.zero,
            })
          },
        ),
        Then('every stop left no virtual machine behind and the workload was reported as a normal termination')(
          (state, expect) =>
            expect({ report: state.checked }, Conformance.render(state.checked)).toMatchObject({
              report: { _tag: 'Pass' },
            }),
        ),
      ),
    )

    scenario(
      'A workload whose live session never reports an exit is stopped at every step and leaves nothing behind',
      Gherkin.Do.pipe(
        Given('a microVM medium bound to a sandbox runtime whose live session reports no exit of its own')(
          'behaviour',
          () => Effect.succeed('waits-for-steps' as const),
        ),
        When('the workload is supervised and the supervision is stopped at every step')(
          'checked',
          (s) => {
            const world = bootWorld(s.behaviour)
            return Conformance.stopped({
              unit: MicroVMMedium.port,
              world,
              program: (built) => Effect.provide(superviseSilentChild, built),
              restart: (built) =>
                Effect.provide(
                  Effect.andThen(
                    Effect.flatMap(Effect.service(SandboxLedger), (ledger) => ledger.restarted),
                    Effect.provide(superviseSilentChild, built),
                  ),
                  built,
                ),
              rule: (built) => Effect.provide(microvmRule, built),
              stopWithin: Duration.zero,
            })
          },
        ),
        Then('every stop ended the session without an exit of its own and left no virtual machine behind')(
          (state, expect) =>
            expect({ report: state.checked }, Conformance.render(state.checked)).toMatchObject({
              report: { _tag: 'Pass' },
            }),
        ),
      ),
    )
  })

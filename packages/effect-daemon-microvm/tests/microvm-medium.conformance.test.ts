import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Conformance } from '@systemfsoftware/conformance-spec'
import type { Conformance as Medium } from '@systemfsoftware/effect-daemon-conformance'
import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { ConfigProvider, Crypto, Effect, Layer, Match, Stream } from 'effect'
import { FIXTURE_IMAGE, READY_TOKEN } from './__fixtures__/child-script.js'
import { ExceptionalTermination } from './__fixtures__/exceptional-termination.schema.js'
import {
  microvmSandboxRuntime,
  nothingLeftBehind,
  type SandboxBehaviour,
} from './__fixtures__/microvm-runtime.fixture.js'

const Feature = makeFeature({ it })

const driver = MicroVMMedium.conformanceDriver(
  new MicroVMMedium.MicroVMWorkload({
    image: FIXTURE_IMAGE,
    command: ['sh', '-c', ':'],
    readyOnStdout: READY_TOKEN,
  }),
)

const STOP_MILLIS = 100

const becomeReady: Medium.ChildStep = { _tag: 'BecomeReady' }

const exitNormal: Medium.ChildStep = { _tag: 'ExitNormal' }

const quietWorkload = new MicroVMMedium.MicroVMWorkload({ image: FIXTURE_IMAGE, command: ['sh', '-c', ':'] })

const normalTermination = (reason: Supervisor.Medium.TerminationReason): Effect.Effect<void, ExceptionalTermination> =>
  Match.value(reason).pipe(
    Match.tag('Normal', () => Effect.void),
    Match.orElse((other) => Effect.fail(new ExceptionalTermination({ observed: other._tag }))),
  )

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

const bootEnvironment = (behaviour: SandboxBehaviour) =>
  Layer.build(Layer.merge(MicroVMMedium.layer(), fakePlatform(behaviour)))

const superviseScriptedChild = Effect.gen(function*() {
  const launched = yield* driver.launch('worker', [])
  yield* launched.control.advance(becomeReady, 0)
  const { medium } = yield* MicroVMMedium.port
  const evidence = yield* medium.start(launched.program)
  yield* evidence.ready
  yield* launched.control.advance(exitNormal, 0)
  yield* normalTermination(yield* medium.report(evidence))
  yield* medium.stop(evidence, { _tag: 'Graceful', millis: STOP_MILLIS })
})

const superviseDrainingChild = Effect.gen(function*() {
  const { medium } = yield* MicroVMMedium.port
  const evidence = yield* medium.start({ workload: quietWorkload, stdin: Stream.empty })
  yield* normalTermination(yield* medium.report(evidence))
  yield* medium.stop(evidence, { _tag: 'Graceful', millis: STOP_MILLIS })
})

const liveReason =
  'each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run'

Feature('Supervising a workload in a microVM until the scope that owns it closes', { timeout: 120_000 })
  .live(liveReason)
  .body(({ scenario }) => {
    scenario(
      'A workload that announces readiness and then exits cleanly leaves no virtual machine behind once the supervision is stopped at any step',
      Gherkin.Do.pipe(
        Given('a microVM medium bound to a sandbox runtime that runs the workload script in process')(
          'environment',
          () => bootEnvironment('waits-for-steps'),
        ),
        When('the workload is supervised and the supervision is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(superviseScriptedChild, s.environment), {
              probe: Effect.provide(nothingLeftBehind, s.environment),
            }),
        ),
        Then('every stop left no virtual machine behind and the workload was reported as a normal termination')(
          (state, expect) => expect(state.checked).toMatchObject({ _tag: 'Pass' }),
        ),
      ),
    )

    scenario(
      'A workload whose session ends without reporting an exit leaves nothing behind once the supervision is stopped at any step',
      Gherkin.Do.pipe(
        Given('a microVM medium bound to a sandbox runtime whose workload session ends without reporting an exit')(
          'environment',
          () => bootEnvironment('ends-after-started'),
        ),
        When('the workload is supervised and the supervision is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(superviseDrainingChild, s.environment), {
              probe: Effect.provide(nothingLeftBehind, s.environment),
            }),
        ),
        Then('every stop left no virtual machine behind and the workload was reported as a normal termination')(
          (state, expect) => expect(state.checked).toMatchObject({ _tag: 'Pass' }),
        ),
      ),
    )
  })

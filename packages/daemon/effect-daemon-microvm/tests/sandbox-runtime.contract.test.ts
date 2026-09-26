import { layer as nodeCryptoLayer } from '@effect/platform-node/NodeCrypto'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Crypto, Effect } from 'effect'
import { Sandbox } from 'microsandbox'
import { FIXTURE_IMAGE } from './__fixtures__/child-script.js'
import { featureNameOf, kvmGate } from './__fixtures__/kvm-gate.js'
import {
  type LawCase,
  type SandboxPlan,
  sandboxRuntimeLaws,
  type SandboxRuntimeUnderTest,
} from './__fixtures__/sandbox-runtime-laws.fixture.js'

const Feature = makeFeature({ it })

const KILL_TIMEOUT_MILLIS = 5_000

const plan: SandboxPlan = {
  name: 'microvm-law-sandbox',
  image: FIXTURE_IMAGE,
  envs: {},
  mounts: [],
  portBindings: [],
}

const heldByHost = (name: string): Effect.Effect<boolean> =>
  Effect.match(Effect.tryPromise({ try: () => Sandbox.get(name), catch: () => undefined }), {
    onFailure: () => false,
    onSuccess: () => true,
  })

const realSandboxRuntime = (): SandboxRuntimeUnderTest<Crypto.Crypto> => ({
  acquire: (plan) =>
    Effect.gen(function*() {
      const crypto = yield* Crypto.Crypto
      const id = yield* Effect.orDie(crypto.randomUUIDv4)
      const runtime = yield* MicroVM.SandboxRuntime
      return yield* runtime.acquire({ ...plan, name: `${plan.name}-${id.slice(0, 8)}` })
    }),
  release: (sandbox) => Effect.flatMap(MicroVM.SandboxRuntime, (runtime) => runtime.release(sandbox)),
  kill: (sandbox) => Effect.tryPromise(() => sandbox.killWithTimeout(KILL_TIMEOUT_MILLIS)).pipe(Effect.orDie),
  heldByOutside: (sandbox) => heldByHost(sandbox.name),
})

const [heldUntilReleased, releaseLeavesNothing, killMidCall, stopDuringRelease] = sandboxRuntimeLaws({
  runtime: realSandboxRuntime,
  plan,
})

const lawPipeline = (event: string, law: LawCase<Crypto.Crypto>) =>
  Gherkin.Do.pipe(
    When(event)('outcome', () => law.check),
    Then('the host holds nothing after that run ended')((state, expect) =>
      expect(state.outcome).toEqual({ held: false })
    ),
  )

Feature(
  featureNameOf('A stopped microVM supervision leaves nothing behind on the host it talked to'),
  kvmGate.available ? undefined : { skip: true },
)
  .live('each scenario boots and tears down a real microsandbox virtual machine on the host')
  .withLayer(nodeCryptoLayer)
  .body(({ scenario }) => {
    scenario(
      'An acquired machine is held by the host until it is released',
      lawPipeline('a supervision boots a machine and then releases it', heldUntilReleased),
    )

    scenario(
      'Releasing a machine leaves the host holding nothing',
      lawPipeline('a supervision releases the machine it booted', releaseLeavesNothing),
    )

    scenario(
      'Killing a machine mid-call leaves a later release able to clear it',
      lawPipeline('a supervision is killed while its workload runs, and its teardown then releases it', killMidCall),
    )

    scenario(
      'A stop that interrupts a release still leaves nothing held',
      lawPipeline('a stop interrupts a supervision in the middle of its release', stopDuringRelease),
    )
  })

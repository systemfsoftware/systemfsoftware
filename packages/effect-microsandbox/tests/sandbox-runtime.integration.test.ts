import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import { type LawCase, type SandboxPlan, sandboxRuntimeLaws } from './__fixtures__/sandbox-runtime-laws.fixture.js'
import { freshSandboxRuntime } from './__fixtures__/sandbox-runtime.fixture.js'

const Feature = makeFeature({ it })

const plan: SandboxPlan = { name: 'law-sandbox', image: 'alpine:3.20', envs: {}, mounts: [], portBindings: [] }

const [heldUntilReleased, releaseLeavesNothing, killMidCall, stopDuringRelease] = sandboxRuntimeLaws({
  runtime: freshSandboxRuntime,
  plan,
})

const lawPipeline = (event: string, law: LawCase) =>
  Gherkin.Do.pipe(
    When(event)('outcome', () => law.check),
    Then('the outside system holds nothing after that run ended')((state, expect) =>
      expect(state.outcome).toEqual({ held: false })
    ),
  )

Feature('A stopped sandbox runtime leaves nothing behind for the host it talked to')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An acquired sandbox is held by the outside system until it is released',
      lawPipeline('a boot acquires a sandbox and then releases it', heldUntilReleased),
    )

    scenario(
      'Releasing a sandbox leaves the outside system holding nothing',
      lawPipeline('a boot releases the sandbox it acquired', releaseLeavesNothing),
    )

    scenario(
      'Killing a sandbox mid-call leaves a later release able to clear it',
      lawPipeline('a boot is killed while its workload runs, and its teardown then releases it', killMidCall),
    )

    scenario(
      'A stop that interrupts a release still leaves nothing held',
      lawPipeline('a stop interrupts a boot in the middle of its release', stopDuringRelease),
    )
  })

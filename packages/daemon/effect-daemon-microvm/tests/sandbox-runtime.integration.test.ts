import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import { FIXTURE_IMAGE } from './__fixtures__/child-script.js'
import { microvmRuntimeUnderTest } from './__fixtures__/microvm-runtime.fixture.js'
import { type LawCase, type SandboxPlan, sandboxRuntimeLaws } from './__fixtures__/sandbox-runtime-laws.fixture.js'

const Feature = makeFeature({ it })

const plan: SandboxPlan = {
  name: 'microvm-law-sandbox',
  image: FIXTURE_IMAGE,
  envs: {},
  mounts: [],
  portBindings: [],
}

const [heldUntilReleased, releaseLeavesNothing, killMidCall, stopDuringRelease] = sandboxRuntimeLaws({
  runtime: () => microvmRuntimeUnderTest('waits-for-steps'),
  plan,
})

const lawPipeline = (event: string, law: LawCase) =>
  Gherkin.Do.pipe(
    When(event)('outcome', () => law.check),
    Then('the outside system holds nothing after that run ended')((state, expect) =>
      expect(state.outcome).toEqual({ held: false })
    ),
  )

Feature('A stopped microVM supervision leaves nothing behind for the host it talked to')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An acquired machine is held by the outside system until it is released',
      lawPipeline('a supervision boots a machine and then releases it', heldUntilReleased),
    )

    scenario(
      'Releasing a machine leaves the outside system holding nothing',
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

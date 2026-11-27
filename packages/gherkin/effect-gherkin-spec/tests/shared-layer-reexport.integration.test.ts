import { Gherkin, Given, it, makeFeature, sharedLayer, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'

const Feature = makeFeature({ it })

const shared = { built: 0 }

class SharedService extends Context.Service<SharedService, { readonly build: number }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/ReexportedShared',
) {}

const Shared = sharedLayer(
  Layer.effect(
    SharedService,
    Effect.acquireRelease(
      Effect.sync(() => {
        shared.built += 1
        return { build: shared.built }
      }),
      () => Effect.void,
    ),
  ),
)

Feature('a feature over the re-exported shared layer').withLayer(Shared).body(({ scenario }) => {
  scenario(
    'the file-level shared layer is built once for the feature',
    Gherkin.Do.pipe(
      Given('the shared layer is available')('shared', () => SharedService),
      Then('the shared layer was built exactly once')((s, expect) =>
        expect({ build: s.shared.build, built: shared.built }).toEqual({ build: 1, built: 1 })
      ),
    ),
  )
})

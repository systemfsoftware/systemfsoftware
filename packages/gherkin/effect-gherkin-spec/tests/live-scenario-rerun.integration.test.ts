import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref } from 'effect'

const Feature = makeFeature({ it })

class Approvals extends Context.Service<Approvals, Ref.Ref<ReadonlyArray<string>>>()(
  '@systemfsoftware/effect-gherkin-spec/tests/live-scenario-rerun.integration.test/Approvals',
) {}

const approvalsLayer = Layer.effect(Approvals, Ref.make<ReadonlyArray<string>>([]))

const recorded = (approval: string) =>
  Approvals.pipe(Effect.flatMap((approvals) => Ref.updateAndGet(approvals, (held) => [...held, approval])))

Feature('A live scenario names what its second run does')
  .withLayer(approvalsLayer)
  .live('a person approves the first run in a browser')
  .body(({ scenario }) => {
    scenario(
      'The second run of a scenario that waits on a person runs its rerun pipeline instead',
      {
        live: 'a person approves the first run in a browser',
        rerun: Gherkin.Do.pipe(
          Given('the second run records an approval from the stand-in')('approvals', () => recorded('stand-in')),
          Then('the person approved once and the stand-in once')(({ approvals }, expect) =>
            expect(approvals).toEqual(['person', 'stand-in'])
          ),
        ),
      },
      Gherkin.Do.pipe(
        Given('the first run records the person’s approval')('approvals', () => recorded('person')),
        Then('the person approved once')(({ approvals }, expect) => expect(approvals).toEqual(['person'])),
      ),
    )
  })

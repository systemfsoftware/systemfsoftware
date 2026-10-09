import { metamorphicReport, reportCheck } from '@systemfsoftware/differential-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { integers } from './__fixtures__/arbitraries.js'

const Feature = makeFeature({ it })

Feature('Proving a system obeys a relation when its input is transformed', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('the metamorphic check explores its own kernel schedules')
  .body(({ scenario }) => {
    scenario(
      'A system whose outputs break the relation is caught with the seed and its follow-up',
      Gherkin.Do.pipe(
        Given('a doubling system whose relation wrongly claims outputs stay equal when the input grows by one')(
          'system',
          () => Effect.succeed((x: number) => Effect.succeed(x * 2)),
        ),
        When('the metamorphic check runs over generated integers')(
          'report',
          (s) => metamorphicReport(s.system, integers, (x) => x + 1, (a, b) => a === b),
        ),
        Then('the report names the seed, its follow-up and both outputs')((s, expect) =>
          expect(s.report).toEqual({
            holds: false,
            report: expect.stringMatching(/seed[\s\S]*followUp[\s\S]*Output A: 0[\s\S]*Output B: 2/),
          })
        ),
      ),
    )

    scenario(
      'A system that settles through promises keeps obeying the relation',
      Gherkin.Do.pipe(
        Given(
          'a system that settles its doubling through a promise while the relation claims growing the input doubles the output',
        )(
          'system',
          () =>
            Effect.succeed((x: number) =>
              Effect.gen(function*() {
                yield* Effect.sleep('1 millis')
                return yield* Effect.promise(() => Promise.resolve(x * 2))
              })
            ),
        ),
        When('the metamorphic check runs over generated integers')(
          'report',
          (s) => metamorphicReport(s.system, integers, (x) => x * 2, (a, b) => b === a * 2),
        ),
        Then('the asynchronous run completes without complaint')((s, expect) => reportCheck(s.report, expect)),
      ),
    )
  })

import { differentialReport } from '@systemfsoftware/differential-spec'
import { contractLaws, directClient, parityChecks } from '@systemfsoftware/effect-contract/testing'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Equal, Option, Result, Schema } from 'effect'
import { boundarySamples } from '../__fixtures__/boundary-samples.fixture.js'
import { flipsRefusals } from '../__fixtures__/flipping-client.fixture.js'
import { capabilities, getBalance } from '../__fixtures__/kernel.fixture.js'
import { operationsScenarioEnvironment } from '../__fixtures__/operations-runtime.fixture.js'

const Feature = makeFeature({ it })

const options = { provide: operationsScenarioEnvironment, runBudget: 100 } as const
const client = directClient({ registry: capabilities, provide: operationsScenarioEnvironment })
const laws = contractLaws(capabilities)

const sameCensus = (expected: Schema.Json, actual: Schema.Json): boolean => Equal.equals(expected, actual)

const sabotagedCheck = Option.getOrThrowWith(
  Option.fromUndefinedOr(
    parityChecks({ getBalance: capabilities.getBalance }, flipsRefusals(client), options)[0],
  ),
  () => new Error('the fixture registry registers no getBalance capability'),
)

const failedInput = (sample: Schema.Json): boolean => Result.isFailure(Schema.decodeResult(getBalance.input)(sample))

const isJsonObject = (sample: Schema.Json): sample is Schema.JsonObject => Schema.is(Schema.JsonObject)(sample)

Feature('The effect-contract testing entry')
  .withScenarioLayer(operationsScenarioEnvironment)
  .live('the differential report drives its own generated schedules')
  .body(({ scenario }) => {
    scenario(
      'A surface client that answers a refusal as a rejection is reported as a disparity',
      Gherkin.Do.pipe(
        When('the sabotaged comparison runs through the differential report')('observed', () =>
          Effect.gen(function*() {
            const report = yield* differentialReport(
              sabotagedCheck.comparison.reference,
              sabotagedCheck.comparison.candidate,
              sabotagedCheck.arbitrary,
              sameCensus,
              { runBudget: 100 },
            )
            return { name: sabotagedCheck.name, holds: report.holds, report: report.report }
          })),
        Then('the report names the capability, holds false and carries the seed')((scope, expect) =>
          expect({
            name: scope.observed.name,
            holds: scope.observed.holds,
            carriesSeed: /seed -?\d+/.test(scope.observed.report),
          }).toEqual({ name: 'getBalance', holds: false, carriesSeed: true })
        ),
      ),
    )

    scenario(
      'Every capability contributes codec laws for its non-error schemas alone',
      Gherkin.Do.pipe(
        When('the fixture registry registers its laws')('names', () => Effect.succeed(laws.map((law) => law.name))),
        Then('each capability contributes input, output and Completed, and a refusal contributes none')(
          (scope, expect) =>
            expect(scope.names).toEqual([
              'getBalance.input',
              'getBalance.output',
              'getBalance.completed',
              'hold.input',
              'hold.output',
              'hold.completed',
              'getOperation.input',
              'getOperation.output',
              'getOperation.completed',
            ]),
        ),
      ),
    )

    scenario(
      'The input boundary encodings reach the refusal boundary, a missing field and an excess property',
      Gherkin.Do.pipe(
        When('the input boundary encodings are sampled')('samples', () => Effect.succeed(boundarySamples)),
        Then('the samples carry a refused encoding, a missing field and an excess property')((scope, expect) =>
          expect({
            refused: scope.samples.some(failedInput),
            missing: scope.samples.some((sample) => isJsonObject(sample) && !('account' in sample)),
            excess: scope.samples.some(
              (sample) => isJsonObject(sample) && 'account' in sample && Object.keys(sample).length > 1,
            ),
          }).toEqual({ refused: true, missing: true, excess: true })
        ),
      ),
    )

    scenario(
      'The parity checks cover every registered capability',
      Gherkin.Do.pipe(
        When('the fixture registry builds its parity checks')(
          'names',
          () => Effect.succeed(parityChecks(capabilities, client, options).map((check) => check.name)),
        ),
        Then('one check names each registered capability')((scope, expect) =>
          expect(scope.names).toEqual(['getBalance', 'hold', 'getOperation'])
        ),
      ),
    )
  })

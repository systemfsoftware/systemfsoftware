import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Result, Schema } from 'effect'
import { Layer } from 'effect'

const Feature = makeFeature({ it })

Feature('Keeping routing evidence well formed')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'A candidate whose probability is <where> is not evidence',
      [
        { where: 'below zero', probability: -0.2 },
        { where: 'above one', probability: 1.2 },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a routing candidate whose probability lies outside zero to one')('payload', () =>
            Effect.succeed({ id: 'find', probability: row.probability })),
          When('the candidate is read back')('outcome', (s) =>
            Effect.succeed(Schema.decodeResult(Discern.Procedure.RouteCandidate)(s.payload))),
          Then('the impossible probability is refused')(({ outcome }) => {
            expect(outcome).toSatisfy(Result.isFailure)
          }),
        ),
    )

    scenario(
      'A candidate without a probability is not evidence',
      Gherkin.Do.pipe(
        Given('a routing candidate that carries no probability')('payload', () => Effect.succeed({ id: 'find' })),
        When('the candidate is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.Procedure.RouteCandidate)(s.payload)),
        ),
        Then('the probability-less candidate is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A candidate whose probability is not a finite number is not evidence',
      Gherkin.Do.pipe(
        Given('a routing candidate whose probability is endless')(
          'payload',
          () => Effect.succeed({ id: 'find', probability: Number.POSITIVE_INFINITY }),
        ),
        When('the candidate is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeResult(Discern.Procedure.RouteCandidate)(s.payload)),
        ),
        Then('the endless probability is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'An uncertainty refusal without its ranking is not evidence',
      Gherkin.Do.pipe(
        Given('an uncertainty refusal that carries no ranking')(
          'payload',
          () => Effect.succeed({ _tag: 'RoutingUncertainError', reason: 'no procedure reached 0.7' }),
        ),
        When('the refusal is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.Procedure.RoutingUncertainError)(s.payload)),
        ),
        Then('the ranking-less refusal is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A depth refusal without its ceiling is not evidence',
      Gherkin.Do.pipe(
        Given('a depth refusal that reports the depth but no ceiling')(
          'payload',
          () => Effect.succeed({ _tag: 'DepthExceededError', depth: 3 }),
        ),
        When('the refusal is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.Procedure.DepthExceededError)(s.payload)),
        ),
        Then('the ceiling-less refusal is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )
  })

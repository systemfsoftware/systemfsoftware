import { expect } from '@effect/vitest'
import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Result, Schema } from 'effect'
import { Layer } from 'effect'

const Feature = makeFeature({ it })

Feature('Recognizing a well-formed refusal')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An undecided-case refusal that names no case is refused',
      Gherkin.Do.pipe(
        Given('a refusal about an undecided case that names no case')(
          'payload',
          () => Effect.succeed({ _tag: 'UncertainMatchError', reason: 'the answer sat between the bounds' }),
        ),
        When('the refusal is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.UncertainMatchError)(s.payload)),
        ),
        Then('the unnamed case is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A collision refusal that names no shared id is refused',
      Gherkin.Do.pipe(
        Given('a refusal about a shared id that names no id')(
          'payload',
          () => Effect.succeed({ _tag: 'DecisionIdCollisionError' }),
        ),
        When('the refusal is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.DecisionIdCollisionError)(s.payload)),
        ),
        Then('the unnamed id is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A threshold refusal that omits its limit is refused',
      Gherkin.Do.pipe(
        Given('a refusal about a threshold that omits the limit it crossed')('payload', () =>
          Effect.succeed({
            _tag: 'InvalidThresholdError',
            threshold: 'miss',
            value: 0.9,
            message: 'Classify threshold `miss` must be <= `match`',
          })),
        When('the refusal is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.InvalidThresholdError)(s.payload)),
        ),
        Then('the unnamed limit is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A refusal whose bound sits beyond what a threshold allows is refused',
      Gherkin.Do.pipe(
        Given('a complete refusal whose recorded value is not a finite number')('payload', () =>
          Effect.succeed({
            _tag: 'InvalidThresholdError' as const,
            threshold: 'miss',
            value: Number.POSITIVE_INFINITY,
            limit: 0.8,
            message: 'Classify threshold `miss` must be <= `match`',
          })),
        When('the refusal is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeResult(Discern.InvalidThresholdError)(s.payload)),
        ),
        Then('the non-finite value is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )
  })

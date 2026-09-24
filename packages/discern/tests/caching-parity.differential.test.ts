import { Differential } from '@systemfsoftware/differential-spec'
import { Discern } from '@systemfsoftware/discern'
import { Effect, Schema } from 'effect'
import * as fc from 'fast-check'
import { answeringProvider } from './__fixtures__/answering-model.fixture.js'
import {
  type AnswerFor,
  answering,
  CountingModel,
  probabilityEverywhere,
} from './__fixtures__/counting-model.fixture.js'

const Change = Discern.on(Schema.String)

const risk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const blocking = Discern.type(Schema.String).pipe(
  Discern.when(risk.above(0.5), () => 'block'),
  Discern.orElse(() => 'ship'),
)

interface Review {
  readonly change: string
  readonly risk: number
}

const reviews: fc.Arbitrary<Review> = fc.record({
  change: fc.string(),
  risk: fc.integer({ min: 0, max: 1000 }).map((thousandths) => thousandths / 1000),
})

const answersForReview = (review: Review): AnswerFor => probabilityEverywhere(review.risk)

const uncachedRun = (review: Review) =>
  Effect.provide(blocking(review.change), Discern.Model.layer(answeringProvider(answersForReview(review))))

const twiceCachedRun = (review: Review) =>
  Effect.gen(function*() {
    const model = yield* CountingModel
    const store = Discern.Model.store()
    const first = yield* Effect.provide(
      blocking(review.change),
      Discern.Model.layer(model.model, [Discern.Model.caching(store)]),
    )
    const second = yield* Effect.provide(
      blocking(review.change),
      Discern.Model.layer(model.model, [Discern.Model.caching(store)]),
    )
    return { first, second, calls: model.calls() }
  }).pipe(Effect.provide(answering(answersForReview(review))))

Differential.compare({
  name: 'a second run of the same review is answered from cache, asking the model once',
  reference: uncachedRun,
  candidate: twiceCachedRun,
})
  .on(reviews)
  .assert((uncached, cached) => uncached === cached.second && cached.first === cached.second && cached.calls === 1)

import { Differential } from '@systemfsoftware/differential-spec'
import { Discern } from '@systemfsoftware/discern'
import { Effect, Match, Schema } from 'effect'
import * as fc from 'fast-check'
import { answeringProvider } from './__fixtures__/answering-model.fixture.js'
import { type AnswerFor, answersFor, probabilityAnswer, rateAnswer } from './__fixtures__/counting-model.fixture.js'

const LEVELS = ['calm', 'risky', 'reckless'] as const
type Level = (typeof LEVELS)[number]

const Change = Discern.on(Schema.String)

const risk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })
const severity = Change.rate({ id: 'severity', instructions: 'How severe is this change', criteria: LEVELS })

const blocking = Discern.type(Schema.String).pipe(
  Discern.when(risk.above(0.5), () => 'block'),
  Discern.when(severity.atLeast('risky'), () => 'escalate'),
  Discern.orElse(() => 'ship'),
)

interface Review {
  readonly change: string
  readonly risk: number
  readonly rating: number
  readonly weights: Readonly<Record<Level, number>>
}

// Constructive: every answer lands in its validated range, so no draw is ever
// discarded and no law passes because both sides refused the same input.
const reviews: fc.Arbitrary<Review> = fc.record({
  change: fc.string(),
  risk: fc.integer({ min: 0, max: 1000 }).map((thousandths) => thousandths / 1000),
  rating: fc.integer({ min: 0, max: LEVELS.length - 1 }),
  weights: fc.record({
    calm: fc.integer({ min: 1, max: 4 }),
    risky: fc.integer({ min: 1, max: 4 }),
    reckless: fc.integer({ min: 1, max: 4 }),
  }),
})

const probabilitiesOf = (weights: Readonly<Record<Level, number>>): Readonly<Record<Level, number>> => {
  const total = LEVELS.reduce((sum, level) => sum + weights[level], 0)
  return { calm: weights.calm / total, risky: weights.risky / total, reckless: weights.reckless / total }
}

const answersForReview = (review: Review): AnswerFor => (request) =>
  answersFor({
    request,
    answerOf: (decision) =>
      Match.value(decision).pipe(
        Match.tag('Rate', () => rateAnswer({ rating: review.rating, probabilities: probabilitiesOf(review.weights) })),
        Match.orElse(() => probabilityAnswer(review.risk)),
      ),
  })

const liveRun = (review: Review) =>
  Effect.provide(blocking(review.change), Discern.Model.layer(answeringProvider(answersForReview(review))))

const recordedThenReplayed = (review: Review) =>
  Effect.gen(function*() {
    const store = Discern.Model.store()
    yield* Effect.provide(
      blocking(review.change),
      Discern.Model.layer(answeringProvider(answersForReview(review)), [Discern.Model.recording(store)]),
    )
    const taken = yield* Discern.Model.snapshot(store)
    return yield* Effect.provide(blocking(review.change), Discern.Model.replayLayer(taken))
  })

// ∀review: what a live policy answers, a policy replayed from that same run's
// recording answers too — including the rating label Effect re-derives from the
// stored probabilities.
Differential.compare({ reference: liveRun, candidate: recordedThenReplayed })
  .on(reviews)
  .assert((live, replayed) => live === replayed)

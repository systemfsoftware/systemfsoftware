import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Match, Schema } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import { expect } from 'vitest'
import {
  type AnswerFor,
  answering,
  answersFor,
  classificationEverywhere,
  classifyAnswer,
  CountingModel,
  probabilityAnswer,
  probabilityEverywhere,
  rateAnswer,
  withProvider,
} from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it })

const Change = Discern.on(Schema.String)

const apiImpact = Change.classify({
  id: 'api-impact',
  instructions: 'Classify API impact',
  criteria: { none: 'none', behavioral: 'behavioral', breaking: 'breaking' },
})
const regressionRisk = Change.probability({ id: 'regression-risk', instructions: 'Likely to regress' })

const reviewPolicy = Discern.type(Schema.String).pipe(
  Discern.when(Discern.and(apiImpact.is('breaking'), regressionRisk.above(0.8)), (change) => `block:${change}`),
  Discern.when(apiImpact.is('breaking'), (change) => `migrate:${change}`),
  Discern.orElse((change) => `ship:${change}`),
)

const breakingAndRisky: AnswerFor = (request) =>
  answersFor({
    request,
    answerOf: (decision) =>
      Match.value(decision).pipe(
        Match.tag(
          'Classify',
          () => classifyAnswer({ label: 'breaking', probabilities: { none: 0.01, behavioral: 0.09, breaking: 0.9 } }),
        ),
        Match.tag('Probability', () => probabilityAnswer(0.91)),
        Match.tag('Rate', () => rateAnswer({ rating: 0, probabilities: {} })),
        Match.exhaustive,
      ),
  })

const changeImpact = Change.classify({
  id: 'impact',
  instructions: 'Classify impact',
  criteria: { none: 'none', additive: 'additive', behavioral: 'behavioral', breaking: 'breaking' },
})

const byVerdict = Discern.match(changeImpact).pipe(
  Discern.case('none', () => 'ship'),
  Discern.case('additive', () => 'docs'),
  Discern.case('behavioral', () => 'review'),
  Discern.case('breaking', () => 'migrate'),
  Discern.exhaustive,
)

const changeRisk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const reviewerOnStandby = Discern.type(Schema.String).pipe(
  Discern.when(changeRisk.above(0.8, { missBelow: 0.5 }), () => 'block', { id: 'high-risk' }),
  Discern.onUncertain((_input, context) => `review:${context.caseId}`),
  Discern.orElse(() => 'ship'),
)

const guessingFallback = Discern.type(Schema.String).pipe(
  Discern.when(changeRisk.above(0.8, { missBelow: 0.5 }), () => 'block', { id: 'high-risk' }),
  Discern.orElse(() => 'ship'),
)

const endsWithTs = (path: string): boolean => path.endsWith('.ts')
const onlySourceFiles = Discern.deterministic(endsWithTs, {
  id: 'source-file',
  description: 'Only TypeScript source files',
})
const riskySource = Discern.and(onlySourceFiles, changeRisk.above(0.8))

const sourcePolicy = Discern.type(Schema.String).pipe(
  Discern.when(riskySource, () => 'review'),
  Discern.orElse(() => 'skip'),
)

const severity = Change.rate({
  id: 'severity',
  instructions: 'Rate severity',
  criteria: ['trivial', 'minor', 'major', 'critical'],
})

const triage = Discern.type(Schema.String).pipe(
  Discern.when(severity.atMost('minor'), () => 'queue'),
  Discern.when(severity.atLeast('major'), () => 'escalate'),
  Discern.orElse(() => 'unclassified'),
)

const moderateSeverity: AnswerFor = (request) =>
  answersFor({
    request,
    answerOf: () => rateAnswer({ rating: 2, probabilities: { trivial: 0, minor: 0, major: 1, critical: 0 } }),
  })

const collidingBefore = Change.probability({ id: 'risk', instructions: 'Risky' })
const collidingAfter = Change.probability({ id: 'risk', instructions: 'Something else entirely' })

const isUncertainRefusal = Schema.is(Discern.UncertainMatchError)

const refusalOf = (
  failure:
    | AiError.AiError
    | Discern.DecisionIdCollisionError
    | Discern.InvalidThresholdError
    | Discern.PolicyCommandRejected
    | Discern.UncertainMatchError,
): Discern.UncertainMatchError | undefined => (isUncertainRefusal(failure) ? failure : undefined)
const crossedBounds = changeImpact.is('breaking', { match: 0.8, miss: 0.9 })
const crossedPolicy = Discern.type(Schema.String).pipe(
  Discern.when(crossedBounds, () => 'block'),
  Discern.orElse(() => 'ship'),
)
const collidingPolicy = Discern.type(Schema.String).pipe(
  Discern.when(Discern.and(collidingBefore.above(0.8), collidingAfter.above(0.8)), () => 'block'),
  Discern.orElse(() => 'ship'),
)
Feature('Reviewing changes with semantic policies')
  .withScenarioLayer(answering(probabilityEverywhere(0.99)))
  .body(({ scenario }) => {
    scenario(
      'A review that hinges on two questions asks the model once about both',
      { scenarioLayer: answering(breakingAndRisky) },
      Gherkin.Do.pipe(
        Given('a review policy over incoming changes')('policy', () => Effect.succeed(reviewPolicy)),
        When('a change is reviewed')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('change-1'), model.model)
          })),
        Then('the change is blocked before it lands')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.verdict).toBe('block:change-1')
            expect(model.calls()).toBe(1)
            expect(model.asked()).toStrictEqual([['api-impact', 'regression-risk']])
            expect(Arr.map(s.policy.plan.decisions, (decision) => decision.id)).toStrictEqual([
              'api-impact',
              'regression-risk',
            ])
          })
        ),
      ),
    )

    scenario(
      'A policy that cannot make up its mind hands the change to a reviewer',
      { scenarioLayer: answering(probabilityEverywhere(0.7)) },
      Gherkin.Do.pipe(
        Given('a policy with a reviewer on standby for undecided changes')(
          'policy',
          () => Effect.succeed(reviewerOnStandby),
        ),
        When('an ambiguous change is judged')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('x'), model.model)
          })),
        Then('the change goes to review instead of the fallback')(({ verdict }) => {
          expect(verdict).toBe('review:high-risk')
        }),
      ),
    )

    scenario(
      'A policy with no reviewer refuses to answer rather than guessing',
      { scenarioLayer: answering(probabilityEverywhere(0.7)) },
      Gherkin.Do.pipe(
        Given('a policy whose only other option is to ship')('policy', () => Effect.succeed(guessingFallback)),
        When('an ambiguous change is judged')('outcome', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* Effect.flip(withProvider(s.policy('x'), model.model))
          })),
        Then('the run refuses to guess and names the undecided case')(({ outcome }) => {
          expect(outcome).toBeInstanceOf(Discern.UncertainMatchError)
          expect(refusalOf(outcome)?.caseId).toBe('high-risk')
        }),
      ),
    )

    scenario(
      'A change a deterministic guard already settles never reaches the model',
      Gherkin.Do.pipe(
        Given('a policy with a source-file guard ahead of the risk question')(
          'policy',
          () => Effect.succeed(sourcePolicy),
        ),
        When('a documentation file is judged')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('README.md'), model.model)
          })),
        Then('the file is skipped and the model was never asked')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.verdict).toBe('skip')
            expect(model.calls()).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'A change the guard lets through is judged by the model',
      Gherkin.Do.pipe(
        Given('a policy with a source-file guard ahead of the risk question')(
          'policy',
          () => Effect.succeed(sourcePolicy),
        ),
        When('a source file is judged')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('index.ts'), model.model)
          })),
        Then('the file is held for review after one model round trip')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.verdict).toBe('review')
            expect(model.calls()).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'A change is dispatched by the verdict the model returned',
      {
        scenarioLayer: answering(classificationEverywhere({
          label: 'behavioral',
          probabilities: {
            none: 0.05,
            additive: 0.1,
            behavioral: 0.8,
            breaking: 0.05,
          },
        })),
      },
      Gherkin.Do.pipe(
        Given('a dispatch table with a handler for every verdict')('policy', () => Effect.succeed(byVerdict)),
        When('a change is dispatched by its impact')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('change'), model.model)
          })),
        Then('the handler for the returned verdict runs')(({ verdict }) => {
          expect(verdict).toBe('review')
        }),
      ),
    )

    scenario(
      'An ordered rating escalates by position on the scale',
      { scenarioLayer: answering(moderateSeverity) },
      Gherkin.Do.pipe(
        Given('a triage policy over an ordered severity scale')('policy', () => Effect.succeed(triage)),
        When('a change is triaged')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('x'), model.model)
          })),
        Then('the change is escalated because its rating sits above the queue band')(({ verdict }) => {
          expect(verdict).toBe('escalate')
        }),
      ),
    )

    scenario(
      'Two questions sharing one id but describing different things cannot coexist',
      Gherkin.Do.pipe(
        Given('a policy whose condition asks the same id two different things')(
          'policy',
          () => Effect.succeed(collidingPolicy),
        ),
        When('a change is judged')('outcome', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* Effect.flip(withProvider(s.policy('change'), model.model))
          })),
        Then('the run is refused, naming the shared id')(({ outcome }) => {
          expect(outcome).toMatchObject({ _tag: 'DecisionIdCollisionError', decisionId: 'risk' })
        }),
      ),
    )

    scenario(
      'A reviewer whose miss bound sits past the match bound cannot judge',
      Gherkin.Do.pipe(
        Given('a policy whose question treats a miss as stricter than a match')(
          'policy',
          () => Effect.succeed(crossedPolicy),
        ),
        When('a change is judged')('outcome', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const outcome = yield* Effect.flip(withProvider(s.policy('change'), model.model))
            const asked = model.calls()
            return { outcome, asked }
          })),
        Then('the run is refused, naming the crossed bounds, and the model is never asked')(({ outcome }) => {
          expect(outcome.outcome).toMatchObject({
            _tag: 'InvalidThresholdError',
            threshold: 'miss',
            value: 0.9,
            limit: 0.8,
          })
          expect(outcome.asked).toBe(0)
        }),
      ),
    )
  })

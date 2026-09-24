import { expect } from '@effect/vitest'
import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Match, Option, Result, Schema } from 'effect'
import { answering, CountingModel, probabilityEverywhere, withProvider } from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it, layer })

const Change = Discern.on(Schema.String)

const buildReviewPolicy = () => {
  const impact = Change.classify({
    id: 'impact',
    instructions: 'Classify impact',
    criteria: { safe: 'safe', breaking: 'breaking' },
  })
  return Discern.type(Schema.String).pipe(
    Discern.when(impact.is('breaking'), () => 'block', { id: 'breaking' }),
  )
}

const changeRisk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const watchedPolicy = Discern.type(Schema.String).pipe(
  Discern.when(changeRisk.above(0.8), () => 'block', { id: 'high' }),
  Discern.orElse(() => 'ship'),
)

const selectedBranchOf = (trace: Discern.Trace): string =>
  Match.value(trace.selected).pipe(
    Match.tag('Case', (chosen) => `case:${chosen.id}`),
    Match.tag('Fallback', () => 'fallback'),
    Match.tag('Uncertain', (pending) => `uncertain:${pending.id}`),
    Match.exhaustive,
  )

const recordedProbabilityOf = (trace: Discern.Trace): number => {
  const ProbabilityAnswer = Schema.Struct({ probability: Schema.Finite })
  return Option.match(Schema.decodeUnknownOption(ProbabilityAnswer)(trace.answers['risk']), {
    onNone: () => -1,
    onSome: (found) => found.probability,
  })
}

const caseOutcomesOf = (trace: Discern.Trace): ReadonlyArray<readonly [string, string]> =>
  Arr.map(trace.cases, (item) => [item.id, item.status])

Feature('Inspecting a policy before trusting it')
  .withScenarioLayer(answering(probabilityEverywhere(0.99)))
  .body(({ scenario }) => {
    scenario(
      'The same policy built twice compiles to the same plan',
      Gherkin.Do.pipe(
        Given('a policy compiled into an execution plan')(
          'first',
          () => Effect.succeed(Discern.compile(buildReviewPolicy())),
        ),
        Given('the same policy compiled a second time')(
          'second',
          () => Effect.succeed(Discern.compile(buildReviewPolicy())),
        ),
        Then('both plans are identical, naming the question and the plan fingerprint')((s) => {
          expect(s.second).toStrictEqual(s.first)
          expect(Arr.map(s.first.decisions, (decision) => decision.id)).toStrictEqual(['impact'])
          expect(s.first.fingerprint).toMatch(/^plan_/)
        }),
      ),
    )

    scenario(
      'A traced run reports which cases it weighed and how each resolved',
      { scenarioLayer: answering(probabilityEverywhere(0.2)) },
      Gherkin.Do.pipe(
        Given('a policy that blocks clearly risky changes and ships the rest')(
          'policy',
          () => Effect.succeed(watchedPolicy),
        ),
        When('a change runs with the trace switched on')('answer', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy.runWithTrace('x'), model.model)
          })),
        Then('the trace names the weighed case, the fallback, and the answer the model gave')((s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            expect(s.answer.value).toBe('ship')
            expect(s.answer.trace.version).toBe(2)
            expect(caseOutcomesOf(s.answer.trace)).toStrictEqual([['high', 'Miss']])
            expect(selectedBranchOf(s.answer.trace)).toBe('fallback')
            expect(recordedProbabilityOf(s.answer.trace)).toBe(0.2)
            expect(model.calls()).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'A plan claiming a newer plan format is turned down',
      Gherkin.Do.pipe(
        Given('a plan that claims a format version no policy writes')('payload', () =>
          Effect.succeed({
            version: 2,
            fingerprint: 'plan_spoofed',
            decisions: [],
            cases: [],
            hasUncertainHandler: false,
          })),
        When('the plan is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.CompiledPlan)(s.payload)),
        ),
        Then('the unknown plan format is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A trace claiming a different trace format is turned down',
      Gherkin.Do.pipe(
        Given('a trace that claims the oldest format version')('payload', () =>
          Effect.succeed({
            version: 1,
            planFingerprint: 'plan_spoofed',
            answers: {},
            cases: [],
            selected: { _tag: 'Fallback' },
          })),
        When('the trace is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.Trace)(s.payload)),
        ),
        Then('the unknown trace format is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A trace resolved by nothing the policy recognises is turned down',
      Gherkin.Do.pipe(
        Given('a well-formed trace whose outcome names an unknown branch')('payload', () =>
          Effect.succeed({
            version: 2,
            planFingerprint: 'plan_current',
            answers: {},
            cases: [],
            selected: { _tag: 'CoinFlip' },
          })),
        When('the trace is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.Trace)(s.payload)),
        ),
        Then('the unknown branch is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A case record resolved to an unrecorded outcome is turned down',
      Gherkin.Do.pipe(
        Given('a case record that claims an outcome no policy can reach')(
          'payload',
          () => Effect.succeed({ id: 'high', status: 'Maybe' }),
        ),
        When('the case record is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.CaseTrace)(s.payload)),
        ),
        Then('the unknown outcome is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A decision record asking an unknown kind of question is turned down',
      Gherkin.Do.pipe(
        Given('a decision record that claims an unknown kind of question')('payload', () =>
          Effect.succeed({
            id: 'd_spoofed',
            fingerprint: 'df_spoofed',
            kind: 'Guess',
            instructions: 'Guess the answer',
          })),
        When('the decision record is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.DecisionInspection)(s.payload)),
        ),
        Then('the unknown kind of question is refused')(({ outcome }) => {
          expect(outcome).toSatisfy(Result.isFailure)
        }),
      ),
    )

    scenario(
      'A verdict with an unknown resolution or an unreadable reason is turned down',
      Gherkin.Do.pipe(
        Given('a verdict that names no known resolution')('unresolved', () => Effect.succeed({ _tag: 'Maybe' })),
        Given('a matched verdict whose reason is not a written explanation')(
          'unreadable',
          () => Effect.succeed({ _tag: 'Match', reason: 42 }),
        ),
        When('both verdicts are read back')('outcomes', (s) =>
          Effect.succeed({
            unresolved: Schema.decodeUnknownResult(Discern.PatternMatched)(s.unresolved),
            unreadable: Schema.decodeUnknownResult(Discern.PatternMatched)(s.unreadable),
          })),
        Then('both verdicts are refused')(({ outcomes }) => {
          expect(outcomes.unresolved).toSatisfy(Result.isFailure)
          expect(outcomes.unreadable).toSatisfy(Result.isFailure)
        }),
      ),
    )
  })

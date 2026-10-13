import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Match, Option, Schema } from 'effect'
import { answering, CountingModel, probabilityEverywhere, withProvider } from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it })

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
        Then('both plans are identical, naming the question and the plan fingerprint')((s, expect) =>
          expect({
            second: s.second,
            decisionIds: Arr.map(s.first.decisions, (decision) => decision.id),
            fingerprint: s.first.fingerprint,
          }).toEqual({
            second: s.first,
            decisionIds: ['impact'],
            fingerprint: expect.stringMatching(/^plan_/),
          })
        ),
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
        Then('the trace names the weighed case, the fallback, and the answer the model gave')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return {
              value: s.answer.value,
              traceVersion: s.answer.trace.version,
              caseOutcomes: caseOutcomesOf(s.answer.trace),
              selectedBranch: selectedBranchOf(s.answer.trace),
              recordedProbability: recordedProbabilityOf(s.answer.trace),
              modelCalls: model.calls(),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              value: 'ship',
              traceVersion: 2,
              caseOutcomes: [['high', 'Miss']],
              selectedBranch: 'fallback',
              recordedProbability: 0.2,
              modelCalls: 1,
            })
          ))
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
        Then('the unknown plan format is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["version"\]/) },
          })
        ),
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
        Then('the unknown trace format is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["version"\]/) },
          })
        ),
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
        Then('the unknown branch is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["selected"\]/) },
          })
        ),
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
        Then('the unknown outcome is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/status/) },
          })
        ),
      ),
    )

    scenario(
      'An uncertain case record that names no reason is turned down',
      Gherkin.Do.pipe(
        Given('a case record that resolved to uncertainty without a reason')(
          'payload',
          () => Effect.succeed({ id: 'high', status: 'Uncertain' }),
        ),
        When('the case record is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeUnknownResult(Discern.CaseTrace)(s.payload)),
        ),
        Then('the unaccounted uncertainty is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/reason/) },
          })
        ),
      ),
    )

    scenario(
      'A matched case record that carries a reason is turned down',
      Gherkin.Do.pipe(
        Given('a matched case record whose variant declares no reason')(
          'payload',
          () => Effect.succeed({ id: 'high', status: 'Match', reason: 'why' }),
        ),
        When('the case record is read back strictly')(
          'outcome',
          (s) =>
            Effect.succeed(Schema.decodeUnknownResult(Discern.CaseTrace, { onExcessProperty: 'error' })(s.payload)),
        ),
        Then('the unexpected reason is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/excess property/) },
          })
        ),
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
        Then('the unknown kind of question is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/kind/) },
          })
        ),
      ),
    )

    scenario(
      'A verdict with an unknown resolution or a reason its variant declares is turned down',
      Gherkin.Do.pipe(
        Given('a verdict that names no known resolution')('unresolved', () => Effect.succeed({ _tag: 'Maybe' })),
        Given('a matched verdict carrying a reason its variant declares')(
          'carrying',
          () => Effect.succeed({ _tag: 'Match', reason: 42 }),
        ),
        When('both verdicts are read back strictly')('outcomes', (s) =>
          Effect.succeed({
            unresolved: Schema.decodeUnknownResult(Discern.PatternMatched)(s.unresolved),
            carrying: Schema.decodeUnknownResult(
              Discern.PatternMatched,
              { onExcessProperty: 'error' },
            )(s.carrying),
          })),
        Then('both verdicts are refused')(({ outcomes }, expect) =>
          expect({
            unresolved: outcomes.unresolved,
            carrying: outcomes.carrying,
          }).toMatchObject({
            unresolved: {
              _tag: 'Failure',
              failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["_tag"\]/) },
            },
            carrying: {
              _tag: 'Failure',
              failure: { _tag: 'SchemaError', message: expect.stringMatching(/excess property/) },
            },
          })
        ),
      ),
    )
  })

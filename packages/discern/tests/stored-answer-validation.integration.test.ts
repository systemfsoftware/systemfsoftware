import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Match, MutableRef, Predicate, Schema } from 'effect'
import type * as AiError from 'effect/ai/AiError'
import type * as DecisionModel from 'effect/ai/DecisionModel'

const Feature = makeFeature({ it })

class CountingModel extends Context.Service<CountingModel, {
  readonly model: Discern.Model.Provider
  readonly calls: () => number
}>()('@systemfsoftware/discern/tests/stored-answer-validation/CountingModel') {}

const probabilityAnswer = (probability: number): DecisionModel.ProviderProbabilityAnswer => ({
  _tag: 'Probability',
  probability,
})

const classifyAnswer = (
  label: string,
  probabilities: Readonly<Record<string, number>>,
): DecisionModel.ProviderClassifyAnswer => ({ _tag: 'Classify', label, probabilities })

const rateAnswer = (
  rating: number,
  probabilities: Readonly<Record<string, number>>,
): DecisionModel.ProviderRateAnswer => ({ _tag: 'Rate', rating, probabilities })

const noImpact = { none: 1, additive: 0, behavioral: 0, breaking: 0 }
const minorSeverity = { trivial: 0, minor: 1, major: 0, critical: 0 }

const validAnswerOf = (decision: Discern.AnyDecision): DecisionModel.ProviderAnswer =>
  Match.value(decision).pipe(
    Match.tag('Classify', () => classifyAnswer('none', noImpact)),
    Match.tag('Probability', () => probabilityAnswer(0.95)),
    Match.tag('Rate', () => rateAnswer(1, minorSeverity)),
    Match.exhaustive,
  )

const uncountedUsage = { inputTokens: undefined, outputTokens: undefined } as const

const answeringValidly: Layer.Layer<DecisionModel.DecisionModel | CountingModel> = Layer.unwrap(
  Effect.sync(() => {
    const calls = MutableRef.make(0)
    const model = Discern.Model.provider(
      (request): Effect.Effect<DecisionModel.ProviderResponse, AiError.AiError> => {
        MutableRef.set(calls, MutableRef.get(calls) + 1)
        const answers: Record<string, DecisionModel.ProviderAnswer> = {}
        for (const [id, decision] of Object.entries(request.decisions)) {
          answers[id] = validAnswerOf(decision)
        }
        return Effect.succeed({ answers, usage: uncountedUsage })
      },
    )
    return Layer.mergeAll(
      Discern.Model.fromProvider(model),
      Layer.succeed(CountingModel, { model, calls: () => MutableRef.get(calls) }),
    )
  }),
)

const withProvider = <A, E>(
  effect: Effect.Effect<A, E, DecisionModel.DecisionModel>,
  model: Discern.Model.Provider,
  interceptors: ReadonlyArray<Discern.Model.Interceptor>,
): Effect.Effect<A, E, never> => Effect.provide(effect, Discern.Model.layer(model, interceptors))

const Change = Discern.on(Schema.String)

const risk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const riskPolicy = Discern.type(Schema.String).pipe(
  Discern.when(risk.above(0.8), () => 'block'),
  Discern.orElse(() => 'ship'),
)

const impact = Change.classify({
  id: 'impact',
  instructions: 'Classify impact',
  criteria: { none: 'none', additive: 'additive', behavioral: 'behavioral', breaking: 'breaking' },
})

const impactPolicy = Discern.type(Schema.String).pipe(
  Discern.when(impact.is('breaking'), () => 'migrate'),
  Discern.orElse(() => 'ship'),
)

const severity = Change.rate({
  id: 'severity',
  instructions: 'Rate severity',
  criteria: ['trivial', 'minor', 'major', 'critical'],
})

const severityPolicy = Discern.type(Schema.String).pipe(
  Discern.when(severity.atLeast('major'), () => 'escalate'),
  Discern.orElse(() => 'queue'),
)

const firstQuestion = Change.probability({ id: 'a', instructions: 'First' })
const secondQuestion = Change.probability({ id: 'b', instructions: 'Second' })

const firstPolicy = Discern.type(Schema.String).pipe(
  Discern.when(firstQuestion.above(0.8), () => 'a'),
  Discern.orElse(() => 'none'),
)

const bothPolicy = Discern.type(Schema.String).pipe(
  Discern.when(Discern.and(firstQuestion.above(0.8), secondQuestion.above(0.8)), () => 'both'),
  Discern.orElse(() => 'none'),
)

const recordingOf = <E extends Error>(run: Effect.Effect<string, E, DecisionModel.DecisionModel>) =>
  Effect.gen(function*() {
    const model = yield* CountingModel
    const into = Discern.Model.store()
    yield* withProvider(run, model.model, [Discern.Model.recording(into)])
    return yield* Discern.Model.snapshot(into)
  })

const tamperedSnapshot = (taken: Discern.Model.Observations, answer: DecisionModel.ProviderAnswer) =>
  Effect.flatMap(
    Schema.encodeEffect(Discern.Model.Observations)(taken),
    (plain) =>
      Schema.encodeUnknownEffect(Schema.Json)({
        version: plain.version,
        entries: Object.fromEntries(
          Object.entries(plain.entries).map(([address, entry]) => [address, { ...entry, answer }]),
        ),
      }),
  )

const storeFrom = (json: Schema.Json) =>
  Effect.gen(function*() {
    const into = Discern.Model.store()
    yield* Discern.Model.load(into, json)
    return into
  })

const observationsFrom = (json: Schema.Json) => Schema.decodeUnknownEffect(Discern.Model.Observations)(json)

const reasonOf = <E>(error: E): string =>
  Predicate.hasProperty(error, 'message') && Predicate.isString(error.message) ? error.message : ''

const invalidObservationOf = <E>(error: E): boolean | undefined => {
  const surface: object = Discern.Model
  return Predicate.hasProperty(surface, 'isInvalidObservation') &&
      Predicate.isFunction(surface.isInvalidObservation)
    ? Reflect.apply(surface.isInvalidObservation, undefined, [error]) === true
    : undefined
}

const failureOf = <E>(error: E) => ({
  invalidObservation: invalidObservationOf(error),
  replayMiss: Discern.Model.isReplayMiss(error),
  reason: reasonOf(error),
})

const tamperedReplayOf = <E extends Error>(
  run: Effect.Effect<string, E, DecisionModel.DecisionModel>,
  answer: DecisionModel.ProviderAnswer,
) =>
  Effect.gen(function*() {
    const model = yield* CountingModel
    const taken = yield* recordingOf(run)
    const into = yield* storeFrom(yield* tamperedSnapshot(taken, answer))
    const refused = yield* Effect.flip(withProvider(run, model.model, [Discern.Model.replaying(into)]))
    return failureOf(refused)
  })

const firstQuestionRecordedTampered = Effect.gen(function*() {
  const model = yield* CountingModel
  const taken = yield* recordingOf(firstPolicy('x'))
  return {
    observations: yield* tamperedSnapshot(taken, probabilityAnswer(7)),
    callsAfterRecording: model.calls(),
  }
})

Feature('Stored answers are held to the rules a provider is held to')
  .withScenarioLayer(answeringValidly)
  .body(({ scenario }) => {
    scenario(
      'A recorded probability tampered to 7 is refused as an invalid observation, not a missing one',
      Gherkin.Do.pipe(
        Given('a blocking policy on a probability question')('policy', () => Effect.succeed(riskPolicy)),
        When('a valid run is recorded, every answer is tampered to 7, and the tampered store replays')(
          'failure',
          (s) => tamperedReplayOf(s.policy('x'), probabilityAnswer(7)),
        ),
        Then('the replay fails naming the probability range')(({ failure }, expect) =>
          expect(failure).toMatchObject({
            invalidObservation: true,
            replayMiss: false,
            reason: expect.stringMatching(/probability outside \[0, 1\]/),
          })
        ),
      ),
    )

    scenario(
      'A recorded classification naming an unknown label is refused as an invalid observation',
      Gherkin.Do.pipe(
        Given('a policy on a classification question')('policy', () => Effect.succeed(impactPolicy)),
        When('a valid run is recorded, its label is tampered to one the question lacks, and the store replays')(
          'failure',
          (s) => tamperedReplayOf(s.policy('x'), classifyAnswer('sideways', noImpact)),
        ),
        Then('the replay fails naming the unknown label')(({ failure }, expect) =>
          expect(failure).toMatchObject({
            invalidObservation: true,
            replayMiss: false,
            reason: expect.stringMatching(/unknown label/),
          })
        ),
      ),
    )

    scenario(
      'A recorded classification whose probabilities sum to 0.5 is refused as an invalid observation',
      Gherkin.Do.pipe(
        Given('a policy on a classification question')('policy', () => Effect.succeed(impactPolicy)),
        When('a valid run is recorded, its distribution is tampered to sum to 0.5, and the store replays')(
          'failure',
          (s) =>
            tamperedReplayOf(
              s.policy('x'),
              classifyAnswer('none', { none: 0.5, additive: 0, behavioral: 0, breaking: 0 }),
            ),
        ),
        Then('the replay fails naming the distribution sum')(({ failure }, expect) =>
          expect(failure).toMatchObject({
            invalidObservation: true,
            replayMiss: false,
            reason: expect.stringMatching(/do not sum to 1/),
          })
        ),
      ),
    )

    scenario(
      'A recorded rating of 99 on a four-level scale is refused as an invalid observation',
      Gherkin.Do.pipe(
        Given('a policy on a four-level rating question')('policy', () => Effect.succeed(severityPolicy)),
        When('a valid run is recorded, its rating is tampered to 99, and the store replays')(
          'failure',
          (s) => tamperedReplayOf(s.policy('x'), rateAnswer(99, minorSeverity)),
        ),
        Then('the replay fails naming the rating range')(({ failure }, expect) =>
          expect(failure).toMatchObject({
            invalidObservation: true,
            replayMiss: false,
            reason: expect.stringMatching(/rating outside \[0, 3\]/),
          })
        ),
      ),
    )

    scenario(
      'A recorded rating of -1 on a four-level scale is refused as an invalid observation',
      Gherkin.Do.pipe(
        Given('a policy on a four-level rating question')('policy', () => Effect.succeed(severityPolicy)),
        When('a valid run is recorded, its rating is tampered to -1, and the store replays')(
          'failure',
          (s) => tamperedReplayOf(s.policy('x'), rateAnswer(-1, minorSeverity)),
        ),
        Then('the replay fails naming the rating range')(({ failure }, expect) =>
          expect(failure).toMatchObject({
            invalidObservation: true,
            replayMiss: false,
            reason: expect.stringMatching(/rating outside \[0, 3\]/),
          })
        ),
      ),
    )

    scenario(
      'A recorded answer of another decision kind is refused as an invalid observation',
      Gherkin.Do.pipe(
        Given('a policy on a probability question')('policy', () => Effect.succeed(riskPolicy)),
        When('a valid run is recorded, its answer is tampered into a classification, and the store replays')(
          'failure',
          (s) => tamperedReplayOf(s.policy('x'), classifyAnswer('none', noImpact)),
        ),
        Then('the replay fails naming the kind the decision expected')(({ failure }, expect) =>
          expect(failure).toMatchObject({
            invalidObservation: true,
            replayMiss: false,
            reason: expect.stringMatching(/expected "Probability"/),
          })
        ),
      ),
    )

    scenario(
      'A cache holding one tampered answer and missing another refuses before asking the model',
      Gherkin.Do.pipe(
        Given('a policy on two questions')('policy', () => Effect.succeed(bothPolicy)),
        Given('a recording of only the first question, tampered to 7')(
          'tampered',
          () => firstQuestionRecordedTampered,
        ),
        When('both questions are judged through a cache over the tampered store')(
          'failure',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const into = yield* storeFrom(s.tampered.observations)
              const refused = yield* Effect.flip(
                withProvider(s.policy('x'), model.model, [Discern.Model.caching(into)]),
              )
              return { ...failureOf(refused), modelCallsSinceRecording: model.calls() - s.tampered.callsAfterRecording }
            }),
        ),
        Then('the run is refused as an invalid observation and the model is never asked')(
          ({ failure }, expect) =>
            expect(failure).toMatchObject({
              invalidObservation: true,
              reason: expect.stringMatching(/probability outside \[0, 1\]/),
              modelCallsSinceRecording: 0,
            }),
        ),
      ),
    )

    scenario(
      'A replay set to ask, with one tampered answer and one missing, refuses before asking the model',
      Gherkin.Do.pipe(
        Given('a policy on two questions')('policy', () => Effect.succeed(bothPolicy)),
        Given('a recording of only the first question, tampered to 7')(
          'tampered',
          () => firstQuestionRecordedTampered,
        ),
        When('both questions are judged replaying the tampered store with onMissing ask')(
          'failure',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const into = yield* storeFrom(s.tampered.observations)
              const refused = yield* Effect.flip(
                withProvider(s.policy('x'), model.model, [Discern.Model.replaying(into, { onMissing: 'ask' })]),
              )
              return { ...failureOf(refused), modelCallsSinceRecording: model.calls() - s.tampered.callsAfterRecording }
            }),
        ),
        Then('the run is refused as an invalid observation and the model is never asked')(
          ({ failure }, expect) =>
            expect(failure).toMatchObject({
              invalidObservation: true,
              replayMiss: false,
              reason: expect.stringMatching(/probability outside \[0, 1\]/),
              modelCallsSinceRecording: 0,
            }),
        ),
      ),
    )

    scenario(
      'Tampered observations handed over as typed data are refused like loaded ones',
      Gherkin.Do.pipe(
        Given('a blocking policy on a probability question')('policy', () => Effect.succeed(riskPolicy)),
        Given('a recording tampered to 7 and read back as typed observations')('observations', () =>
          Effect.flatMap(
            recordingOf(riskPolicy('x')),
            (taken) => Effect.flatMap(tamperedSnapshot(taken, probabilityAnswer(7)), observationsFrom),
          )),
        When('the typed observations are replayed directly, through a store built from them, and cached')(
          'failures',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const replayedDirectly = yield* Effect.flip(
                withProvider(s.policy('x'), model.model, [Discern.Model.replaying(s.observations)]),
              )
              const replayedFromStore = yield* Effect.flip(
                withProvider(s.policy('x'), model.model, [
                  Discern.Model.replaying(Discern.Model.store(s.observations)),
                ]),
              )
              const cached = yield* Effect.flip(
                withProvider(s.policy('x'), model.model, [Discern.Model.caching(Discern.Model.store(s.observations))]),
              )
              return {
                replayedDirectly: failureOf(replayedDirectly),
                replayedFromStore: failureOf(replayedFromStore),
                cached: failureOf(cached),
              }
            }),
        ),
        Then('every entry point refuses the answer as an invalid observation')(({ failures }, expect) =>
          expect(failures).toMatchObject({
            replayedDirectly: {
              invalidObservation: true,
              replayMiss: false,
              reason: expect.stringMatching(/probability outside \[0, 1\]/),
            },
            replayedFromStore: {
              invalidObservation: true,
              replayMiss: false,
              reason: expect.stringMatching(/probability outside \[0, 1\]/),
            },
            cached: {
              invalidObservation: true,
              replayMiss: false,
              reason: expect.stringMatching(/probability outside \[0, 1\]/),
            },
          })
        ),
      ),
    )

    scenario(
      'A replay set to fail names the missing answer, not the tampered one beside it',
      Gherkin.Do.pipe(
        Given('a policy on two questions')('policy', () => Effect.succeed(bothPolicy)),
        Given('a recording of only the first question, tampered to 7')(
          'tampered',
          () => firstQuestionRecordedTampered,
        ),
        When('both questions are judged replaying the tampered store with onMissing fail')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const into = yield* storeFrom(s.tampered.observations)
              const refused = yield* Effect.flip(
                withProvider(s.policy('x'), model.model, [Discern.Model.replaying(into, { onMissing: 'fail' })]),
              )
              return {
                refused,
                replayMiss: Discern.Model.isReplayMiss(refused),
                reason: reasonOf(refused),
                modelCallsSinceRecording: model.calls() - s.tampered.callsAfterRecording,
              }
            }),
        ),
        Then('the run fails as a replay miss, never reading the tampered answer, and the model is never asked')(
          ({ outcome }, expect) =>
            expect(outcome).toMatchObject({
              refused: { _tag: 'AiError', module: 'Discern', method: 'replaying' },
              replayMiss: true,
              reason: expect.not.stringMatching(/outside \[0, 1\]/),
              modelCallsSinceRecording: 0,
            }),
        ),
      ),
    )

    scenario(
      'A valid recording replays and caches without the model',
      Gherkin.Do.pipe(
        Given('a policy on two questions')('policy', () => Effect.succeed(bothPolicy)),
        Given('a valid recording of both questions')('recorded', () =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const taken = yield* recordingOf(bothPolicy('x'))
            return { taken, callsAfterRecording: model.calls() }
          })),
        When('the recording is replayed, then judged through a cache over it')(
          'verdicts',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const replayed = yield* withProvider(s.policy('x'), model.model, [
                Discern.Model.replaying(Discern.Model.store(s.recorded.taken)),
              ])
              const cached = yield* withProvider(s.policy('x'), model.model, [
                Discern.Model.caching(Discern.Model.store(s.recorded.taken)),
              ])
              return { replayed, cached, modelCallsSinceRecording: model.calls() - s.recorded.callsAfterRecording }
            }),
        ),
        Then('both runs reach the recorded verdict and the model was never asked')(({ verdicts }, expect) =>
          expect(verdicts).toEqual({ replayed: 'both', cached: 'both', modelCallsSinceRecording: 0 })
        ),
      ),
    )

    scenario(
      'An empty store sends every decision to the model, whether caching or replaying set to ask',
      Gherkin.Do.pipe(
        Given('a policy on two questions')('policy', () => Effect.succeed(bothPolicy)),
        When('both questions are judged through a cache over an empty store, and replaying an empty store set to ask')(
          'verdicts',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const cached = yield* withProvider(s.policy('x'), model.model, [
                Discern.Model.caching(Discern.Model.store()),
              ])
              const replayed = yield* withProvider(s.policy('x'), model.model, [
                Discern.Model.replaying(Discern.Model.store(), { onMissing: 'ask' }),
              ])
              return { cached, replayed, modelCalls: model.calls() }
            }),
        ),
        Then('the model was asked once per run, about both questions in one batch')(({ verdicts }, expect) =>
          expect(verdicts).toEqual({ cached: 'both', replayed: 'both', modelCalls: 2 })
        ),
      ),
    )
  })

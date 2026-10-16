import { Discern } from '@systemfsoftware/discern'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Match, Schema } from 'effect'
import {
  type AnswerFor,
  answering,
  answersFor,
  CountingModel,
  probabilityAnswer,
  probabilityEverywhere,
  tally,
  withProvider,
} from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it })

const Change = Discern.on(Schema.String)

const risk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const plainBlocking = Discern.type(Schema.String).pipe(
  Discern.when(risk.above(0.8), () => 'block'),
  Discern.orElse(() => 'ship'),
)

const beforeRewording = Change.probability({ id: 'risk', instructions: 'Risky' })
const afterRewording = Change.probability({ id: 'risk', instructions: 'Risky, reworded' })

const policyOn = (decision: Discern.ProbabilityDecision<string, typeof Schema.String>) =>
  Discern.type(Schema.String).pipe(
    Discern.when(decision.above(0.8), () => 'block'),
    Discern.orElse(() => 'ship'),
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

const secondPolicy = Discern.type(Schema.String).pipe(
  Discern.when(secondQuestion.above(0.8), () => 'hit'),
  Discern.orElse(() => 'miss'),
)

const riskyForSourceFiles: AnswerFor = (request) =>
  answersFor({ request, answerOf: () => probabilityAnswer(request.state === 'risky.ts' ? 0.95 : 0.05) })

Feature('Recording what the model said and replaying it later')
  .withScenarioLayer(answering(probabilityEverywhere(0.95)))
  .body(({ scenario }) => {
    scenario(
      'A recorded review replays without the model, handler work included',
      Gherkin.Do.pipe(
        Given('a handler that counts each run')('counter', () => Effect.succeed(tally())),
        Given('a blocking policy on top of that handler')(
          'policy',
          (s) =>
            Effect.succeed(
              Discern.type(Schema.String).pipe(
                Discern.when(risk.above(0.8), (input) => {
                  s.counter.bump()
                  return `block:${input}`
                }),
                Discern.orElse((input) => `ship:${input}`),
              ),
            ),
        ),
        Given('a recording store')('store', () => Effect.succeed(Discern.Model.store())),
        When('a change is reviewed with recording switched on')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('x'), model.model, [Discern.Model.recording(s.store)])
          })),
        Then('the same change replays from the recording, handler work and all')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const taken = yield* Discern.Model.snapshot(s.store)
            const replayed = yield* Effect.provide(s.policy('x'), Discern.Model.replayLayer(taken))
            return {
              replayed,
              modelCalls: model.calls(),
              handlerRuns: s.counter.count(),
              storedObservations: yield* Discern.Model.size(s.store),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              replayed: 'block:x',
              modelCalls: 1,
              handlerRuns: 2,
              storedObservations: 1,
            })
          ))
        ),
      ),
    )

    scenario(
      'A recording survives a trip through plain data',
      Gherkin.Do.pipe(
        Given('a blocking policy')('policy', () => Effect.succeed(plainBlocking)),
        Given('a recording store')('store', () => Effect.succeed(Discern.Model.store())),
        When('a change is reviewed with recording switched on')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('x'), model.model, [Discern.Model.recording(s.store)])
          })),
        When('the recording travels through plain data into a fresh store')('fresh', (s) =>
          Effect.flatMap(
            Discern.Model.snapshot(s.store),
            (taken) =>
              Effect.flatMap(
                Schema.encodeEffect(Discern.Model.Observations)(taken),
                (plainData) =>
                  Effect.flatMap(
                    Schema.encodeUnknownEffect(Schema.Json)(plainData),
                    (json) =>
                      Effect.map(
                        Schema.decodeUnknownEffect(Discern.Model.Observations)(json),
                        (reloaded) => Discern.Model.store(reloaded),
                      ),
                  ),
              ),
          )),
        Then('the fresh store replays the change without the model')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            const taken = yield* Discern.Model.snapshot(s.fresh)
            const replayed = yield* Effect.provide(s.policy('x'), Discern.Model.replayLayer(taken))
            return { replayed, modelCalls: model.calls() }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              replayed: 'block',
              modelCalls: 1,
            })
          ))
        ),
      ),
    )

    scenario(
      'A question reworded after recording is a different question to the replay',
      Gherkin.Do.pipe(
        Given('a policy asking the question as it was first worded')(
          'policy',
          () => Effect.succeed(policyOn(beforeRewording)),
        ),
        Given('a recording store')('store', () => Effect.succeed(Discern.Model.store())),
        When('a change is reviewed with recording switched on')('verdict', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policy('x'), model.model, [Discern.Model.recording(s.store)])
          })),
        Then('the recorded run replays, and the reworded policy refuses to use it')((s, expect) =>
          Effect.gen(function*() {
            const taken = yield* Discern.Model.snapshot(s.store)
            const replayed = yield* Effect.provide(s.policy('x'), Discern.Model.replayLayer(taken))
            const reworded = yield* Effect.flip(
              Effect.provide(policyOn(afterRewording)('x'), Discern.Model.replayLayer(taken)),
            )
            return { replayed, reworded }
          }).pipe(Effect.map((answer) =>
            expect(answer).toMatchObject({
              replayed: 'block',
              reworded: { _tag: 'AiError', module: 'Discern', method: 'replaying' },
            })
          ))
        ),
      ),
    )

    scenario(
      'The same question about two different changes is recorded separately',
      { scenarioLayer: answering(riskyForSourceFiles) },
      Gherkin.Do.pipe(
        Given('a blocking policy')('policy', () => Effect.succeed(plainBlocking)),
        Given('a recording store')('store', () => Effect.succeed(Discern.Model.store())),
        When('a risky file and a safe file are both reviewed with recording on')(
          'verdicts',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const riskyFile = yield* withProvider(s.policy('risky.ts'), model.model, [
                Discern.Model.recording(s.store),
              ])
              const safeFile = yield* withProvider(s.policy('safe.ts'), model.model, [
                Discern.Model.recording(s.store),
              ])
              return { riskyFile, safeFile }
            }),
        ),
        Then('each file replays its own answer')((s, expect) =>
          Effect.gen(function*() {
            const recorded = {
              riskyFile: s.verdicts.riskyFile,
              safeFile: s.verdicts.safeFile,
              storedObservations: yield* Discern.Model.size(s.store),
            }
            const taken = yield* Discern.Model.snapshot(s.store)
            return {
              ...recorded,
              replayedRisky: yield* Effect.provide(s.policy('risky.ts'), Discern.Model.replayLayer(taken)),
              replayedSafe: yield* Effect.provide(s.policy('safe.ts'), Discern.Model.replayLayer(taken)),
            }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              riskyFile: 'block',
              safeFile: 'ship',
              storedObservations: 2,
              replayedRisky: 'block',
              replayedSafe: 'ship',
            })
          ))
        ),
      ),
    )

    scenario(
      'A replay missing one answer refuses rather than guessing',
      Gherkin.Do.pipe(
        Given('a policy that asks only the first question, and one that asks both')(
          'policies',
          () => Effect.succeed({ first: firstPolicy, both: bothPolicy }),
        ),
        Given('a recording store')('store', () => Effect.succeed(Discern.Model.store())),
        When('only the first question is recorded')('first', (s) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return yield* withProvider(s.policies.first('x'), model.model, [Discern.Model.recording(s.store)])
          })),
        Then('a full replay of the two-question policy is refused')((s, expect) =>
          Effect.gen(function*() {
            const taken = yield* Discern.Model.snapshot(s.store)
            const missing = yield* Effect.flip(
              Effect.provide(s.policies.both('x'), Discern.Model.replayLayer(taken)),
            )
            return missing
          }).pipe(Effect.map((answer) =>
            expect(answer).toMatchObject({
              _tag: 'AiError',
              module: 'Discern',
              method: 'replaying',
            })
          ))
        ),
      ),
    )

    scenario(
      'A replay missing one answer can ask the model for the rest',
      Gherkin.Do.pipe(
        Given('a policy that asks only the first question, and one that asks both')(
          'policies',
          () => Effect.succeed({ first: firstPolicy, both: bothPolicy }),
        ),
        Given('a recording store')('store', () => Effect.succeed(Discern.Model.store())),
        When('only the first question is recorded, then both are asked with replaying on')(
          'verdict',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              yield* withProvider(s.policies.first('x'), model.model, [Discern.Model.recording(s.store)])
              const replayed = yield* withProvider(s.policies.both('x'), model.model, [
                Discern.Model.replaying(s.store, { onMissing: 'ask' }),
              ])
              return replayed
            }),
        ),
        Then('only the unrecorded question reached the model')((s, expect) =>
          Effect.gen(function*() {
            const model = yield* CountingModel
            return { verdict: s.verdict, asked: model.asked() }
          }).pipe(Effect.map((answer) =>
            expect(answer).toEqual({
              verdict: 'both',
              asked: [['a'], ['b']],
            })
          ))
        ),
      ),
    )

    scenario(
      'Loading a recording replaces what the store held',
      Gherkin.Do.pipe(
        Given('two policies, each asking its own question')(
          'policies',
          () => Effect.succeed({ first: firstPolicy, second: secondPolicy }),
        ),
        When('each policy records into its own store, and one loads the other')(
          'stores',
          (s) =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const first = Discern.Model.store()
              const second = Discern.Model.store()
              yield* withProvider(s.policies.first('x'), model.model, [Discern.Model.recording(first)])
              yield* withProvider(s.policies.second('x'), model.model, [Discern.Model.recording(second)])
              yield* Effect.flatMap(
                Discern.Model.snapshot(second),
                (taken) =>
                  Effect.flatMap(
                    Schema.encodeEffect(Discern.Model.Observations)(taken),
                    (plainData) =>
                      Effect.flatMap(
                        Schema.encodeUnknownEffect(Schema.Json)(plainData),
                        (json) => Discern.Model.load(first, json),
                      ),
                  ),
              )
              return { first, second }
            }),
        ),
        Then('the store holds only what was loaded into it')((s, expect) =>
          Effect.gen(function*() {
            const storedObservations = yield* Discern.Model.size(s.stores.first)
            const taken = yield* Discern.Model.snapshot(s.stores.first)
            const absent = yield* Effect.flip(
              Effect.provide(s.policies.first('x'), Discern.Model.replayLayer(taken)),
            )
            const second = yield* Effect.provide(s.policies.second('x'), Discern.Model.replayLayer(taken))
            return { storedObservations, absent, second }
          }).pipe(Effect.map((answer) =>
            expect(answer).toMatchObject({
              storedObservations: 1,
              absent: { _tag: 'AiError', module: 'Discern', method: 'replaying' },
              second: 'hit',
            })
          ))
        ),
      ),
    )

    scenario(
      'A snapshot written by another version is turned down by the store',
      Gherkin.Do.pipe(
        Given('a fresh store')('store', () => Effect.succeed(Discern.Model.store())),
        When('a snapshot claiming a version no store writes is loaded')(
          'refused',
          (s) => Effect.flip(Discern.Model.load(s.store, { version: 99, entries: {} })),
        ),
        Then('the store blames the foreign format version')(({ refused }, expect) =>
          expect(
            Match.value(refused).pipe(
              Match.tag('UnsupportedObservationFormatError', (unsupported) => unsupported.version),
              Match.orElse(() => -1),
            ),
          ).toBe(99)
        ),
      ),
    )

    scenario(
      'Snapshots claiming a foreign format version are refused on read',
      Gherkin.Do.pipe(
        Given('one snapshot claiming a version too old and one too new')('payloads', () =>
          Effect.succeed({
            older: { version: 1, entries: {} },
            newer: { version: 99, entries: {} },
          })),
        When('both snapshots are read back')('outcomes', (s) =>
          Effect.succeed({
            older: Schema.decodeUnknownResult(Discern.Model.Observations)(s.payloads.older),
            newer: Schema.decodeUnknownResult(Discern.Model.Observations)(s.payloads.newer),
          })),
        Then('both are refused')(({ outcomes }, expect) =>
          expect({ older: outcomes.older, newer: outcomes.newer }).toMatchObject({
            older: {
              _tag: 'Failure',
              failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["version"\]/) },
            },
            newer: {
              _tag: 'Failure',
              failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["version"\]/) },
            },
          })
        ),
      ),
    )

    scenario(
      'An entry asking an unknown kind of question, or answering unreadably, is refused on read',
      Gherkin.Do.pipe(
        Given('one entry asking an unknown kind of question and one answering unreadably')(
          'payloads',
          () =>
            Effect.succeed({
              unknownKind: {
                decisionId: 'risk',
                fingerprint: 'df_risk',
                kind: 'Guess',
                region: [],
                answer: { _tag: 'Probability', probability: 0.5 },
              },
              unreadableAnswer: {
                decisionId: 'risk',
                fingerprint: 'df_risk',
                kind: 'Probability',
                region: [],
                answer: { _tag: 'Probability', probability: 'high' },
              },
            }),
        ),
        When('both entries are read back as observations')('outcomes', (s) =>
          Effect.succeed({
            unknownKind: Schema.decodeUnknownResult(Discern.Model.Observation)(s.payloads.unknownKind),
            unreadableAnswer: Schema.decodeUnknownResult(Discern.Model.Observation)(s.payloads.unreadableAnswer),
          })),
        Then('both entries are refused')(({ outcomes }, expect) =>
          expect({ unknownKind: outcomes.unknownKind, unreadableAnswer: outcomes.unreadableAnswer }).toMatchObject({
            unknownKind: {
              _tag: 'Failure',
              failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["kind"\]/) },
            },
            unreadableAnswer: {
              _tag: 'Failure',
              failure: { _tag: 'SchemaError', message: expect.stringMatching(/at \["answer"\]\["probability"\]/) },
            },
          })
        ),
      ),
    )

    scenario(
      'A snapshot of the current version with unreadable entries is refused on read',
      Gherkin.Do.pipe(
        Given('a fresh store that only accepts readable entries')('store', () => Effect.succeed(Discern.Model.store())),
        When('a snapshot of the right version with unreadable entries is loaded')(
          'refused',
          (s) => Effect.flip(Discern.Model.load(s.store, { version: 2, entries: { oops: { broken: true } } })),
        ),
        Then('the store blames the entries, not the format version')(({ refused }, expect) =>
          expect(refused).toMatchObject({
            _tag: 'MalformedObservationSnapshotError',
            detail: expect.stringMatching(/at \["entries"\]\["oops"\]\["decisionId"\]/),
          })
        ),
      ),
    )

    scenario(
      'A recording whose distribution leaves the unit interval is refused on read',
      Gherkin.Do.pipe(
        Given('a stored classification answer whose probabilities are outside the unit interval')(
          'payload',
          () =>
            Effect.succeed({
              decisionId: 'risk',
              fingerprint: 'df_risk',
              kind: 'Classify' as const,
              region: [],
              answer: { _tag: 'Classify' as const, label: 'safe', probabilities: { safe: 1.5, breaking: -0.5 } },
            }),
        ),
        When('the observation is read back')(
          'outcome',
          (s) => Effect.succeed(Schema.decodeResult(Discern.Model.Observation)(s.payload)),
        ),
        Then('the out-of-range distribution is refused')(({ outcome }, expect) =>
          expect(outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'SchemaError', message: expect.stringMatching(/answer/) },
          })
        ),
      ),
    )
  })

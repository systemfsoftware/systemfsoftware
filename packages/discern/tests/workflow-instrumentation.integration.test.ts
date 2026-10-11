import { Discern } from '@systemfsoftware/discern'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Schema, Tracer } from 'effect'
import { answering, CountingModel, probabilityEverywhere, withProvider } from './__fixtures__/counting-model.fixture.js'

const Feature = makeFeature({ it })

type SpanAttributes = Tracer.NativeSpan['attributes']

const attributesNamed = <A, E, R>(
  spanName: string,
  program: Effect.Effect<A, E, R>,
): Effect.Effect<ReadonlyArray<SpanAttributes>, E, R> => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return Effect.map(Effect.withTracer(program, tracer), () => {
    const named = spans.filter((span) => span.name === spanName)
    if (named.length === 0) throw new Error(`the run opened no span named ${spanName}`)
    return named.map((span) => span.attributes)
  })
}

const attributesOf = <A, E, R>(
  spanName: string,
  program: Effect.Effect<A, E, R>,
): Effect.Effect<SpanAttributes, E, R> =>
  Effect.map(attributesNamed(spanName, program), (spans) => {
    const [first] = spans
    if (first === undefined) throw new Error(`the run opened no span named ${spanName}`)
    return first
  })

const Change = Discern.on(Schema.String)

const risk = Change.probability({ id: 'risk', instructions: 'How risky is this change' })

const uncertainHandled = Discern.type(Schema.String).pipe(
  Discern.when(risk.above(0.8), () => 'block'),
  Discern.onUncertain(() => 'review'),
  Discern.orElse(() => 'ship'),
)

const uncertainRefused = Discern.type(Schema.String).pipe(
  Discern.when(risk.above(0.8), () => 'block'),
  Discern.orElse(() => 'ship'),
)

const riskyEnough = risk.above(0.8)

const labelled = (input: string, expected: boolean): Discern.EvalExample<string> => ({ input, expected })

Feature('A workflow brands its cell span with the fields its decision reads')
  .withScenarioLayer(answering(probabilityEverywhere(0.95)))
  .body(({ scenario }) => {
    scenario(
      'A select-case span carries whether the policy installed an uncertain handler',
      Gherkin.Do.pipe(
        When('a policy with an uncertain handler and one without each review a change')(
          'spans',
          () =>
            Effect.gen(function*() {
              return {
                withHandler: yield* attributesOf('discern.policy.run', uncertainHandled('x')),
                withoutHandler: yield* attributesOf('discern.policy.run', uncertainRefused('x')),
              }
            }),
        ),
        Then('each select-case span carries whether an uncertain handler was installed')((s, expect) =>
          expect({
            withHandler: s.spans.withHandler.get('app.discern.select-case.has-uncertain-handler'),
            withoutHandler: s.spans.withoutHandler.get('app.discern.select-case.has-uncertain-handler'),
          }).toEqual({ withHandler: true, withoutHandler: false })
        ),
      ),
    )

    scenario(
      'A score-eval-record span carries the expected flag of the example it scored',
      Gherkin.Do.pipe(
        When('one pattern is measured over an example it should match and one it should miss')(
          'spans',
          () =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              return yield* attributesNamed(
                'discern.eval.measure',
                withProvider(
                  Discern.Eval.run(Schema.String, riskyEnough, [labelled('x', true), labelled('x', false)]),
                  model.model,
                ),
              )
            }),
        ),
        Then('each measure span carries the expected flag of its own record')((s, expect) =>
          expect(Arr.map(s.spans, (attributes) => attributes.get('app.discern.score-eval-record.expected')))
            .toEqual([true, false])
        ),
      ),
    )

    scenario(
      'A select-observation-source span carries the on-missing policy its cell was configured with',
      Gherkin.Do.pipe(
        When('a policy reviews a change through a cache and then through a complete replay')(
          'spans',
          () =>
            Effect.gen(function*() {
              const model = yield* CountingModel
              const cache = Discern.Model.store()
              const cached = yield* attributesOf(
                'discern.model.cache',
                withProvider(uncertainRefused('x'), model.model, [Discern.Model.caching(cache)]),
              )
              const recording = Discern.Model.store()
              yield* withProvider(uncertainRefused('x'), model.model, [Discern.Model.recording(recording)])
              const replayed = yield* attributesOf(
                'discern.model.replay',
                withProvider(uncertainRefused('x'), model.model, [
                  Discern.Model.replaying(recording, { onMissing: 'fail' }),
                ]),
              )
              return { cached, replayed }
            }),
        ),
        Then('the cache asks for what it lacks and the replay keeps the policy it was configured with')((s, expect) =>
          expect({
            cached: s.spans.cached.get('app.discern.on_missing'),
            replayed: s.spans.replayed.get('app.discern.on_missing'),
          }).toEqual({ cached: 'ask', replayed: 'fail' })
        ),
      ),
    )
  })

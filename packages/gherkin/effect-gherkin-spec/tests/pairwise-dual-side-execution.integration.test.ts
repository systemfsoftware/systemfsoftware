import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, pairwiseFor, StepError, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref, Result } from 'effect'

const Feature = makeFeature({ it })

class Widget extends Context.Service<Widget, { readonly value: string }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/pairwise-dual-side-execution.integration.test/Widget',
) {}

const layerA = Layer.succeed(Widget, { value: 'side-a' })
const layerB = Layer.succeed(Widget, { value: 'side-b' })

const PairwiseAB = pairwiseFor(
  { a: { name: 'A', layer: layerA }, b: { name: 'B', layer: layerB } },
  Widget,
)

const stepErrorFacts = (result: Result.Result<object, StepError>) =>
  Result.match(result, {
    onFailure: (error) => ({ _tag: error._tag, keyword: error.keyword, text: error.text, cause: error.cause }),
    onSuccess: () => null,
  })

Feature('pairwiseFor — dual-side execution')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Running a workload against two sides yields distinct service values',
      Gherkin.Do.pipe(
        PairwiseAB('the workload reads Widget')('dual', () => (w) => Effect.succeed(w.value)),
        Then('the two values match their layers')(({ dual }, expect) =>
          expect({ a: dual.a, b: dual.b, aLabel: dual.aLabel, bLabel: dual.bLabel }).toEqual({
            a: 'side-a',
            b: 'side-b',
            aLabel: 'A',
            bLabel: 'B',
          })
        ),
      ),
    )

    scenario(
      'A failure on side B specifically attributes the step error to side B',
      (() => {
        const workload = (w: { readonly value: string }) =>
          w.value === 'side-a' ? Effect.succeed(true) : Effect.fail('side_b_defect')
        return Gherkin.Do.pipe(
          When('the pairwise workload runs against both sides')('result', () =>
            Effect.result(
              Gherkin.Do.pipe(PairwiseAB('executing widget operation')('dual', (_s) => workload)),
            )),
          Then('the failure is attributed to side B with its own cause')((s, expect) =>
            expect({ failure: stepErrorFacts(s.result) }).toEqual({
              failure: {
                _tag: 'StepError',
                keyword: 'pairwise',
                text: 'executing widget operation [B]',
                cause: 'side_b_defect',
              },
            })
          ),
        )
      })(),
    )

    scenario(
      'A failure on side A halts execution immediately and never evaluates side B',
      (() => {
        const sideBExecuted = { value: false }
        const workload = (w: { readonly value: string }) => {
          if (w.value === 'side-a') {
            return Effect.fail('side_a_fatal')
          }
          sideBExecuted.value = true
          return Effect.succeed(true)
        }
        return Gherkin.Do.pipe(
          When('the pairwise workload runs against both sides')('result', () =>
            Effect.result(
              Gherkin.Do.pipe(PairwiseAB('executing widget operation')('dual', (_s) => workload)),
            )),
          Then('side A fails, side B never runs, and the failure is attributed to side A')((s, expect) =>
            expect({ failure: stepErrorFacts(s.result), sideBExecuted: sideBExecuted.value }).toEqual({
              failure: {
                _tag: 'StepError',
                keyword: 'pairwise',
                text: 'executing widget operation [A]',
                cause: 'side_a_fatal',
              },
              sideBExecuted: false,
            })
          ),
        )
      })(),
    )

    scenario(
      'Each side acquires its layer separately',
      Effect.gen(function*() {
        const counter = yield* Ref.make(0)
        const layerSide = Layer.effect(
          Widget,
          Ref.updateAndGet(counter, (n) => n + 1).pipe(
            Effect.map((n) => ({ value: `fresh-${n}` })),
          ),
        )
        const PairwiseFresh = pairwiseFor(
          { a: { name: 'FA', layer: layerSide }, b: { name: 'FB', layer: layerSide } },
          Widget,
        )
        return yield* Gherkin.Do.pipe(
          PairwiseFresh('read widget')('dual', () => (w) => Effect.succeed(w.value)),
          Then('two sequential acquires increment the shared counter')(({ dual }, expect) =>
            expect({ a: dual.a, b: dual.b }).toEqual({ a: 'fresh-1', b: 'fresh-2' })
          ),
        )
      }),
    )
  })

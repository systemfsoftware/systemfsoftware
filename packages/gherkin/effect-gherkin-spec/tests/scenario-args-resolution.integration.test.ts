/**
 * Scenario registration — argument resolution.
 *
 * Drives `scenario(...)` on `makeFeature` with malformed argument shapes and
 * proves that `resolveScenarioArgs` returns the right defensive pipeline in
 * each case — the kind of failure a downstream consumer would only see if a
 * step body or options object was supplied where it should not have been.
 */
import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, resolveScenarioArgs, StepError, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Result } from 'effect'

const readyPipeline = Effect.succeed('ready')

const Feature = makeFeature({ it })

Feature('Scenario registration — argument resolution')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An undefined second argument yields a failing pipeline',
      Gherkin.Do.pipe(
        When('the scenario arguments are resolved')(
          'result',
          () => Effect.result(resolveScenarioArgs<never>(void 0, void 0).pipeline),
        ),
        Then('the pipeline fails asking for a pipeline')((s, expect) =>
          expect(s.result).toEqual(
            Result.fail(
              StepError.make({ keyword: 'scenario', text: 'pipeline or options required', cause: void 0 }),
            ),
          )
        ),
      ),
    )

    scenario(
      'Providing options without a pipeline yields a failing pipeline',
      Gherkin.Do.pipe(
        When('the scenario arguments are resolved')(
          'result',
          () => Effect.result(resolveScenarioArgs<never>({ layer: Layer.empty }, void 0).pipeline),
        ),
        Then('the pipeline fails asking for the pipeline the options need')((s, expect) =>
          expect(s.result).toEqual(
            Result.fail(
              StepError.make({
                keyword: 'scenario',
                text: 'pipeline is required when options are provided',
                cause: void 0,
              }),
            ),
          )
        ),
      ),
    )

    scenario(
      'A live reason in the options object resolves as options',
      Gherkin.Do.pipe(
        When('the scenario arguments are resolved')(
          'resolved',
          () => Effect.succeed(resolveScenarioArgs<never>({ live: 'waits on real I/O' }, readyPipeline)),
        ),
        Then('the options resolve as a live scenario and the pipeline is preserved')((s, expect) =>
          expect({ opts: s.resolved.opts, pipelinePreserved: s.resolved.pipeline === readyPipeline }).toEqual({
            opts: { live: 'waits on real I/O' },
            pipelinePreserved: true,
          })
        ),
      ),
    )
  })

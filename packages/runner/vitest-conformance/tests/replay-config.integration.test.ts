import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'
import { replayRunOutput } from './__fixtures__/replay-run'

const Feature = makeFeature({ it })

Feature('Rerunning a refuted property with the config the run loaded')
  .live('each scenario starts a nested Vitest run whose config file the simulation kernel cannot observe')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A refuted property reprints its rerun line carrying the loaded config file',
      Gherkin.Do.pipe(
        Given('a run whose config adds the replay plugin and whose test fails with a rerun line')(
          'output',
          () => replayRunOutput('refuted.probe.ts'),
        ),
        Then('the reprinted line names the config file after the vitest run command')((s, expect) =>
          expect(s.output).toContain(
            'pnpm --filter @scope/pkg exec vitest run --config vitest.config.ts src/a.test.ts -t "Should_BeRefuted_When_Run"',
          )
        ),
      ),
    )
    scenario(
      'A run whose tests pass reprints nothing',
      Gherkin.Do.pipe(
        Given('a run whose config adds the replay plugin and whose test passes')(
          'output',
          () => replayRunOutput('passing.probe.ts'),
        ),
        Then('no rerun line is reprinted')((s, expect) =>
          expect(s.output).not.toContain('Rerun with the config this run loaded')
        ),
      ),
    )
  })

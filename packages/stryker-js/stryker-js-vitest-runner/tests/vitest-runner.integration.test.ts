import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Options, Plugin } from '@systemfsoftware/stryker-js'
import { strykerPlugins, vitestRunner } from '@systemfsoftware/stryker-js-vitest-runner'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

/** The options a mutation run resolves for itself, decoded through the ABI's schema. */
const defaultOptions = (): Options.StrykerOptions => {
  const result = Options.StrykerOptionsSchema['~standard'].validate({})
  if (result instanceof Promise || !('value' in result)) {
    throw new Error('the ABI options schema refused its own default document')
  }
  return result.value
}

Feature('Choosing the vitest test runner for a mutation run')
  .body(({ scenario }) => {
    scenario(
      'A mutation run discovers one runner for vitest among the declarations',
      Gherkin.Do.pipe(
        Given('the runner plugin a mutation run loads')(
          'loaded',
          () => Effect.succeed({ vitestRunner, strykerPlugins }),
        ),
        When('the run reads the declarations the package exports')(
          'declaration',
          (s) =>
            Effect.sync(() => ({
              named: `${s.loaded.vitestRunner.kind}:${s.loaded.vitestRunner.name}`,
              declared: s.loaded.strykerPlugins.map((contribution) => `${contribution.kind}:${contribution.name}`),
            })),
        ),
        Then('it finds a single test runner the configuration can select')((s) =>
          Effect.sync(() => {
            expect(s.declaration).toEqual({ named: 'TestRunner:vitest', declared: ['TestRunner:vitest'] })
          })
        ),
      ),
    )

    scenario(
      'The declarations are the ones the plugin loader reads',
      Gherkin.Do.pipe(
        Given('the declarations the package exports')('declared', () => Effect.succeed({ strykerPlugins })),
        When('a host reads them through the contract it loads plugins with')(
          'decoded',
          (s) =>
            Effect.sync(() =>
              Plugin.PluginModuleSchema['~standard'].validate({ strykerPlugins: s.declared.strykerPlugins })
            ),
        ),
        Then('the loader reads one test runner, named vitest')((s) =>
          Effect.sync(() => {
            expect(s.decoded).toMatchObject({ value: { strykerPlugins: [{ kind: 'TestRunner', name: 'vitest' }] } })
          })
        ),
      ),
    )

    scenario(
      'The factory hands back the surface a run drives the runner with',
      Gherkin.Do.pipe(
        Given('the options a mutation run resolved for itself')('options', () => Effect.sync(defaultOptions)),
        When('the runner is built from them')('runner', (s) => Effect.sync(() => vitestRunner.make(s.options, {}))),
        Then('it reports what it can do and offers the calls a run makes')((s) =>
          Effect.sync(() => {
            expect(s.runner.capabilities?.()).toEqual({ reloadEnvironment: true })
            expect(s.runner.init).toBeTypeOf('function')
            expect(s.runner.dispose).toBeTypeOf('function')
            expect(s.runner.dryRun).toBeTypeOf('function')
            expect(s.runner.mutantRun).toBeTypeOf('function')
          })
        ),
      ),
    )
  })

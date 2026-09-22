import * as NodeServices from '@effect/platform-node/NodeServices'
import { loadExtractorConfig } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Path from 'effect/Path'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const fixturesUrl = new URL('__fixtures__/config-lookup/', import.meta.url)

const resolveFixturePath = (relative: string): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = yield* path.fromFileUrl(fixturesUrl).pipe(
      Effect.orElseSucceed(() => ''),
    )
    return path.resolve(root, relative)
  })

Feature('Discovering and preparing project configuration')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'Extending a base configuration overrides list properties and merges object options',
      Gherkin.Do.pipe(
        Given('a configuration file inheriting from a shared base')(
          'configPath',
          () => resolveFixturePath('config-lookup1/api-extractor.json'),
        ),
        When('the engine prepares the configuration')(
          'config',
          (s) => loadExtractorConfig(s.configPath),
        ),
        Then('bundled packages are replaced by the derived list')(
          (s) => {
            expect(s.config.bundledPackages).toEqual(['derived-pkg-override'])
          },
        ),
        Then('the API report file name from the derived configuration is applied')(
          (s) => {
            expect(s.config.apiReport.reportConfigs[0]?.fileName).toBe(
              'lookup1.api.md',
            )
          },
        ),
        Then('unspecified compiler options are inherited from the base')(
          (s) => {
            expect(s.config.tsconfigFilePath).toContain('tsconfig.json')
          },
        ),
      ),
    )

    scenario(
      'Loading a production repository configuration verifies all declared sections',
      Gherkin.Do.pipe(
        Given('the committed configuration for the npm-package workspace')(
          'repoConfigPath',
          () => resolveFixturePath('../../../../npm-package/api-extractor.json'),
        ),
        When('the engine loads the production configuration')(
          'config',
          (s) => loadExtractorConfig(s.repoConfigPath),
        ),
        Then('the declared main entry point matches the build artifact location')(
          (s) => {
            expect(s.config.mainEntryPointFilePath).toContain('dist/index.d.ts')
          },
        ),
        Then('the API report output folder is resolved within the project directory')(
          (s) => {
            expect(s.config.apiReport.reportFolder).toContain('etc')
          },
        ),
      ),
    )

    scenario(
      'Searching for configuration in an unconfigured directory reports absence',
      Gherkin.Do.pipe(
        Given('a directory with no api-extractor configuration')(
          'emptyFolder',
          () => resolveFixturePath('base-config'),
        ),
        When('a configuration load is attempted')(
          'result',
          (s) => loadExtractorConfig(s.emptyFolder).pipe(Effect.exit),
        ),
        Then('the operation fails because the file does not exist')(
          (s) => {
            expect(s.result._tag).toBe('Failure')
          },
        ),
      ),
    )
  })

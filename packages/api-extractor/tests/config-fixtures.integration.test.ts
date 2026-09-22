import * as NodeServices from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import {
  type ExtractionRun,
  type FixtureSandbox,
  runExtraction,
  withFixtureProject,
} from './__fixtures__/extractor-harness.js'

const Feature = makeFeature({ it, layer })

const workingPackage = 'extractor-flow/simple-pkg'

const repositoryConfigUrl = new URL('../../npm-package/api-extractor.json', import.meta.url)

interface ConfigurationReview {
  readonly configPath: string
  readonly run: ExtractionRun
}

const reviewWithConfiguration = (config: string) => ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configPath = path.join(projectRoot, 'api-extractor.json')
    yield* fs.writeFileString(configPath, config)
    return { configPath, run: yield* runExtraction(configPath) } satisfies ConfigurationReview
  })

const reviewUnreadableConfiguration = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const configPath = path.join(projectRoot, 'corrupt-config', 'broken.json.txt')
    return { configPath, run: yield* runExtraction(configPath) } satisfies ConfigurationReview
  })

const reviewMissingConfiguration = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const configPath = path.join(projectRoot, 'nowhere', 'api-extractor.json')
    return { configPath, run: yield* runExtraction(configPath) } satisfies ConfigurationReview
  })

const reviewPairOfConfigurations = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const firstPath = path.join(projectRoot, 'first.json')
    yield* fs.writeFileString(firstPath, '{"extends": "./second.json"}')
    yield* fs.writeFileString(path.join(projectRoot, 'second.json'), '{"extends": "./first.json"}')
    return { configPath: firstPath, run: yield* runExtraction(firstPath) } satisfies ConfigurationReview
  })

const reviewConfigurationWithoutCompilerSettings = ({ root }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFolder = path.join(root, 'unlocated', 'config')
    const configPath = path.join(configFolder, 'api-extractor.json')
    yield* fs.makeDirectory(configFolder, { recursive: true })
    yield* fs.writeFileString(
      configPath,
      '{"mainEntryPointFilePath": "<projectFolder>/index.d.ts", "apiReport": {"enabled": false},' +
        ' "docModel": {"enabled": false}, "dtsRollup": {"enabled": false}}',
    )
    return { configPath, run: yield* runExtraction(configPath) } satisfies ConfigurationReview
  })

const unrecognizedConfigurationValues = [
  {
    setting: 'a newline style it does not know',
    config: '{"newlineKind": "bogus"}',
    refusal: 'ConfigSchemaValidationError',
  },
  {
    setting: 'a release variant it does not know',
    config: '{"apiReport": {"enabled": true, "reportVariants": ["internal"]}}',
    refusal: 'ConfigSchemaValidationError',
  },
  {
    setting: 'a reporting level it does not know',
    config: '{"messages": {"extractorMessageReporting": {"ae-undocumented": {"logLevel": "loud"}}}}',
    refusal: 'ConfigSchemaValidationError',
  },
  {
    setting: 'a report switch that is not a switch',
    config: '{"apiReport": {"enabled": 42}}',
    refusal: 'ConfigSchemaValidationError',
  },
] as const

Feature('Locating and reading a project\u2019s extractor configuration')
  .withLayer(NodeServices.layer)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A configuration that extends a shared base keeps the derived lists and inherits the rest',
      Gherkin.Do.pipe(
        Given('a project whose configuration extends a shared base')(
          'config',
          () =>
            withFixtureProject('config-lookup', ({ projectRoot }) =>
              Effect.gen(function*() {
                const path = yield* Path.Path
                return yield* Extractor.loadConfig(path.join(projectRoot, 'config-lookup1', 'api-extractor.json'))
              })),
        ),
        Then('the list the derived configuration declares replaces the base list')((s) => {
          expect(s.config.bundledPackages).toEqual(['derived-pkg-override'])
        }),
        Then('the derived report file name is the one the review writes')((s) => {
          expect(s.config.apiReport.reportConfigs[0]?.fileName).toBe('lookup1.api.md')
        }),
        Then('the compiler settings the base declares are inherited')((s) => {
          expect(s.config.tsconfigFilePath).toContain('config-lookup1')
          expect(s.config.tsconfigFilePath).toContain('tsconfig.json')
        }),
      ),
    )

    scenario(
      'A repository configuration that declares every section loads with its sections resolved',
      Gherkin.Do.pipe(
        Given('the configuration a published workspace package commits')(
          'config',
          () =>
            Effect.gen(function*() {
              const path = yield* Path.Path
              return yield* Extractor.loadConfig(yield* path.fromFileUrl(repositoryConfigUrl))
            }),
        ),
        Then('its entry point points at the built declarations')((s) => {
          expect(s.config.mainEntryPointFilePath).toContain('dist/index.d.ts')
        }),
        Then('its reports are written beside the package')((s) => {
          expect(s.config.apiReport.reportFolder).toContain('/etc')
          expect(s.config.apiReport.reportConfigs[0]?.fileName).toBe('npm-package.api.md')
        }),
        Then('it bundles nothing')((s) => {
          expect(s.config.bundledPackages).toEqual([])
        }),
      ),
    )

    scenarioOutline(
      'A configuration that asks for <setting> is refused',
      unrecognizedConfigurationValues,
      (row) =>
        Gherkin.Do.pipe(
          Given('a project whose configuration sets a value the engine does not recognize')(
            'review',
            () => withFixtureProject(workingPackage, reviewWithConfiguration(row.config)),
          ),
          Then('the review is refused')((s) => {
            expect(s.review.run.outcome).toMatchObject({ _tag: 'Failure', failure: { _tag: row.refusal } })
          }),
          Then('the refusal names the configuration file')((s) => {
            expect(s.review.run.outcome).toMatchObject({ failure: { filePath: s.review.configPath } })
          }),
        ),
    )

    scenario(
      'A configuration file that is not valid JSON is refused',
      Gherkin.Do.pipe(
        Given('a project whose configuration file stops midway through')(
          'review',
          () => withFixtureProject('extractor-flow', reviewUnreadableConfiguration),
        ),
        Then('the review is refused because the configuration could not be read')((s) => {
          expect(s.review.run.outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'ConfigJsonSyntaxError', filePath: s.review.configPath },
          })
        }),
      ),
    )

    scenario(
      'A configuration path where no file exists is refused and names the path that was requested',
      Gherkin.Do.pipe(
        Given('a project reviewed at a configuration path that holds no file')(
          'review',
          () => withFixtureProject(workingPackage, reviewMissingConfiguration),
        ),
        Then('the review is refused because the configuration is missing')((s) => {
          expect(s.review.run.outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'ConfigFileNotFound', filePath: s.review.configPath },
          })
        }),
      ),
    )

    scenario(
      'Two configurations that extend each other are refused',
      Gherkin.Do.pipe(
        Given('a project holding two configurations that each extend the other')(
          'review',
          () => withFixtureProject(workingPackage, reviewPairOfConfigurations),
        ),
        Then('the review is refused because the inheritance never ends')((s) => {
          expect(s.review.run.outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'CircularConfigExtendsError' },
          })
        }),
        Then('the refusal lists the configuration cycle')((s) => {
          const outcome = s.review.run.outcome
          if (!Result.isFailure(outcome)) {
            throw new Error('the review was expected to be refused')
          }
          expect(outcome.failure).toMatchObject({
            chain: [
              s.review.configPath,
              expect.stringContaining('second.json'),
              s.review.configPath,
            ],
          })
        }),
      ),
    )

    scenario(
      'A configuration whose location cannot be resolved is refused',
      Gherkin.Do.pipe(
        Given('a configuration that sits in a folder with no compiler settings anywhere above it')(
          'review',
          () => withFixtureProject(workingPackage, reviewConfigurationWithoutCompilerSettings),
        ),
        Then('the review is refused because the project folder cannot be located')((s) => {
          expect(s.review.run.outcome).toMatchObject({
            _tag: 'Failure',
            failure: {
              _tag: 'ConfigSchemaValidationError',
              issues: [expect.stringContaining('Could not find tsconfig.json in parent folders')],
            },
          })
        }),
      ),
    )
  })

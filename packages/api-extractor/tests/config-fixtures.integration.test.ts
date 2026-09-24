import * as NodeServices from '@effect/platform-node/NodeServices'
import { expect } from '@effect/vitest'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'

import {
  changedEntries,
  type ExtractionRun,
  type FixtureSandbox,
  reviewProject,
  runExtraction,
  withFixtureProject,
} from './__fixtures__/extractor-harness.js'

const Feature = makeFeature({ it })

const workingPackage = 'extractor-flow/simple-pkg'

const repositoryConfigUrl = new URL('../../npm-package/api-extractor.json', import.meta.url)

interface ConfigurationReview {
  readonly configPath: string
  readonly run: ExtractionRun
}

const reportOutcomesOf = (run: ExtractionRun): ReadonlyArray<Extractor.ReportOutcome> =>
  Result.isSuccess(run.outcome) ? run.outcome.success.outcomes : []

const reviewWithConfiguration = (config: string) => ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configPath = path.join(projectRoot, 'api-extractor.json')
    yield* fs.writeFileString(configPath, config)
    return { configPath, run: yield* runExtraction({ configPath }) } satisfies ConfigurationReview
  })

const reviewUnreadableConfiguration = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const configPath = path.join(projectRoot, 'corrupt-config', 'broken.json.txt')
    return { configPath, run: yield* runExtraction({ configPath }) } satisfies ConfigurationReview
  })

const reviewMissingConfiguration = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const configPath = path.join(projectRoot, 'nowhere', 'api-extractor.json')
    return { configPath, run: yield* runExtraction({ configPath }) } satisfies ConfigurationReview
  })

const reviewPairOfConfigurations = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const firstPath = path.join(projectRoot, 'first.json')
    yield* fs.writeFileString(firstPath, '{"extends": "./second.json"}')
    yield* fs.writeFileString(path.join(projectRoot, 'second.json'), '{"extends": "./first.json"}')
    return { configPath: firstPath, run: yield* runExtraction({ configPath: firstPath }) } satisfies ConfigurationReview
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
    return { configPath, run: yield* runExtraction({ configPath }) } satisfies ConfigurationReview
  })

const inheritedBaseConfiguration = `{
  "mainEntryPointFilePath": "<projectFolder>/index.d.ts",
  "compiler": { "tsconfigFilePath": "<projectFolder>/tsconfig.json" },
  "bundledPackages": ["base-pkg-1", "base-pkg-2"],
  "apiReport": { "enabled": true, "reportFileName": "base-report.api.md", "reportVariants": ["public"] },
  "docModel": { "enabled": false },
  "dtsRollup": { "enabled": false }
}`

const derivedConfiguration = `{
  "extends": "./inherited-base.json",
  "bundledPackages": ["derived-pkg-override"],
  "apiReport": { "reportFileName": "lookup1.api.md", "reportVariants": ["complete", "beta"] }
}`

/**
 * The committed configuration of the extending project, plus the report variants the derived
 * configuration declares: both files gain a list of report variants so the review shows which
 * list won and which compiler settings were inherited.
 */
const reviewExtendingProject = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFolder = path.join(projectRoot, 'config-lookup1')
    yield* fs.writeFileString(path.join(configFolder, 'inherited-base.json'), inheritedBaseConfiguration)
    yield* fs.writeFileString(path.join(configFolder, 'derived.json'), derivedConfiguration)
    return yield* reviewProject({ projectRoot: configFolder, configPath: path.join(configFolder, 'derived.json') })
  })

/**
 * The committed configuration of the published workspace package, reviewed against a package
 * laid out the way the published one is: declarations built beside the sources, and the
 * compiler settings file the configuration names.
 */
const reviewPublishedConfiguration = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const committed = yield* fs.readFileString(yield* path.fromFileUrl(repositoryConfigUrl))
    yield* fs.writeFileString(path.join(projectRoot, 'api-extractor.json'), committed)
    yield* fs.copy(path.join(projectRoot, 'lib/index.d.ts'), path.join(projectRoot, 'dist/index.d.ts'))
    yield* fs.copy(path.join(projectRoot, 'tsconfig.json'), path.join(projectRoot, 'tsconfig.api.json'))
    return yield* reviewProject({ projectRoot, configPath: path.join(projectRoot, 'api-extractor.json') })
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
  .live('the review runs the real extractor over a fixture project on the host filesystem')
  .withLayer(NodeServices.layer)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A configuration that extends a shared base keeps the derived lists and inherits the rest',
      Gherkin.Do.pipe(
        Given('a project whose configuration extends a shared base')(
          'review',
          () => withFixtureProject({ fixture: 'config-lookup', use: reviewExtendingProject }),
        ),
        Then('the list the derived configuration declares replaces the base list')((s) => {
          expect(reportOutcomesOf(s.review.run).map((outcome) => outcome.variant)).toEqual(['complete', 'beta'])
        }),
        Then('the derived report file name is the one the review writes')((s) => {
          expect(reportOutcomesOf(s.review.run).map((outcome) => outcome.reportFileName)).toEqual([
            'lookup1.api.md',
            'lookup1.beta.api.md',
          ])
        }),
        Then('the compiler settings the base declares are inherited')((s) => {
          const generated = reportOutcomesOf(s.review.run).map((outcome) => outcome.generatedText)
          expect(generated.length).toBeGreaterThan(0)
          expect(generated.filter((text) => !text.includes('export const a = 1'))).toEqual([])
        }),
      ),
    )

    scenario(
      'A repository configuration that declares every section loads with its sections resolved',
      Gherkin.Do.pipe(
        Given('the configuration a published workspace package commits')(
          'review',
          () => withFixtureProject({ fixture: workingPackage, use: reviewPublishedConfiguration }),
        ),
        Then('its entry point points at the built declarations')((s) => {
          expect(changedEntries({ before: s.review.before, after: s.review.after })).toContain('dist/index.d.ts')
        }),
        Then('its reports are written beside the package')((s) => {
          const [report] = reportOutcomesOf(s.review.run)
          expect(report?.reportFileName).toBe('npm-package.api.md')
          expect(report?.reportPath.endsWith('/etc/npm-package.api.md')).toBe(true)
          expect(report?.reportTempPath.endsWith('/temp/main/npm-package.api.md')).toBe(true)
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
            () => withFixtureProject({ fixture: workingPackage, use: reviewWithConfiguration(row.config) }),
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
      'A configuration that names its entry point with a placeholder the engine does not know is refused',
      Gherkin.Do.pipe(
        Given('a project whose entry point is written under an unknown "<sourceFolder>" placeholder')(
          'review',
          () =>
            withFixtureProject({
              fixture: workingPackage,
              use: reviewWithConfiguration(
                '{"mainEntryPointFilePath": "<sourceFolder>/index.d.ts", "apiReport": {"enabled": false},' +
                  ' "docModel": {"enabled": false}, "dtsRollup": {"enabled": false}}',
              ),
            }),
        ),
        Then('the review is refused because of the unknown placeholder')((s) => {
          expect(s.review.run.outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'UnresolvedTokenError', token: '<sourceFolder>', configPath: s.review.configPath },
          })
        }),
      ),
    )

    scenario(
      'A configuration file that is not valid JSON is refused',
      Gherkin.Do.pipe(
        Given('a project whose configuration file stops midway through')(
          'review',
          () => withFixtureProject({ fixture: 'extractor-flow', use: reviewUnreadableConfiguration }),
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
          () => withFixtureProject({ fixture: workingPackage, use: reviewMissingConfiguration }),
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
          () => withFixtureProject({ fixture: workingPackage, use: reviewPairOfConfigurations }),
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
          () => withFixtureProject({ fixture: workingPackage, use: reviewConfigurationWithoutCompilerSettings }),
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

import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'

import {
  type ExtractionRun,
  failureOf,
  type FixtureSandbox,
  reviewProject,
  runExtraction,
  withFixtureProject,
} from './__fixtures__/extractor-harness.fixture.js'

const Feature = makeFeature({ it })

const workingPackage = 'flow/simple-pkg'

const repositoryConfigUrl = new URL('../../npm-package/api-extractor.json', import.meta.url)

interface ConfigurationReview {
  readonly configPath: string
  readonly run: ExtractionRun
}

type ConfigurationRefusal = {
  readonly setting: string
  readonly config: string
  readonly refusal: string
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

const reviewExtendingProject = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFolder = path.join(projectRoot, 'config-lookup1')
    yield* fs.writeFileString(path.join(configFolder, 'inherited-base.json'), inheritedBaseConfiguration)
    yield* fs.writeFileString(path.join(configFolder, 'derived.json'), derivedConfiguration)
    return yield* reviewProject({ projectRoot: configFolder, configPath: path.join(configFolder, 'derived.json') })
  })

const nodeModuleDerivedConfiguration = `{
  "extends": "shared-config/api-extractor-base.json",
  "apiReport": { "reportFileName": "bare.api.md", "reportVariants": ["complete", "beta"] }
}`

const reviewExtendingNodeModuleBase = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFolder = path.join(projectRoot, 'config-lookup1')
    const sharedFolder = path.join(projectRoot, 'node_modules/shared-config')
    yield* fs.makeDirectory(sharedFolder, { recursive: true })
    yield* fs.writeFileString(path.join(sharedFolder, 'api-extractor-base.json'), inheritedBaseConfiguration)
    yield* fs.writeFileString(path.join(configFolder, 'derived.json'), nodeModuleDerivedConfiguration)
    return yield* reviewProject({ projectRoot: configFolder, configPath: path.join(configFolder, 'derived.json') })
  })

const backslashDerivedConfiguration = `{
  "extends": ".\\\\absent-base.json",
  "apiReport": { "enabled": false },
  "docModel": { "enabled": false },
  "dtsRollup": { "enabled": false }
}`

const reviewExtendingBackslashRelativeBase = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFolder = path.join(projectRoot, 'config-lookup1')
    const configPath = path.join(configFolder, 'derived.json')
    yield* fs.writeFileString(configPath, backslashDerivedConfiguration)
    return { configPath, run: yield* runExtraction({ configPath }) } satisfies ConfigurationReview
  })

const unresolvableDerivedConfiguration = `{
  "extends": "no-such-package/api-extractor-base.json"
}`

const reviewExtendingUnresolvableBase = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configPath = path.join(projectRoot, 'config-lookup1', 'unresolvable.json')
    yield* fs.writeFileString(configPath, unresolvableDerivedConfiguration)
    return { configPath, run: yield* runExtraction({ configPath }) } satisfies ConfigurationReview
  })

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

const unrecognizedConfigurationValues: ReadonlyArray<ConfigurationRefusal> = [
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
]

Feature('Locating and reading a project\u2019s extractor configuration')
  .live('the review runs the real extractor over a fixture project on the host filesystem')
  .withLayer(nodeServicesLayer)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A configuration that extends a shared base keeps the derived lists and inherits the rest',
      Gherkin.Do.pipe(
        Given('a project whose configuration extends a shared base')(
          'review',
          () => withFixtureProject({ fixture: 'flow/config-lookup', use: reviewExtendingProject }),
        ),
        Then('the derived lists win and the inherited compiler settings rendered every report')((s, expect) => {
          const outcomes = reportOutcomesOf(s.review.run)
          return expect({
            variants: outcomes.map((outcome) => outcome.variant),
            reportFileNames: outcomes.map((outcome) => outcome.reportFileName),
            everyReportCarriesTheInheritedDeclaration: outcomes.every((outcome) =>
              outcome.generatedText.includes('export const a = 1')
            ),
          }).toEqual({
            variants: ['complete', 'beta'],
            reportFileNames: ['lookup1.api.md', 'lookup1.beta.api.md'],
            everyReportCarriesTheInheritedDeclaration: true,
          })
        }),
      ),
    )

    scenario(
      'A configuration that extends a base config named by package resolves it through node_modules',
      Gherkin.Do.pipe(
        Given('a project whose configuration extends a base config that only exists in node_modules')(
          'review',
          () => withFixtureProject({ fixture: 'flow/config-lookup', use: reviewExtendingNodeModuleBase }),
        ),
        Then('the base in node_modules is read, so its declaration reached every report')((s, expect) => {
          const outcomes = reportOutcomesOf(s.review.run)
          return expect({
            variants: outcomes.map((outcome) => outcome.variant),
            reportFileNames: outcomes.map((outcome) => outcome.reportFileName),
            everyReportCarriesTheInheritedDeclaration: outcomes.every((outcome) =>
              outcome.generatedText.includes('export const a = 1')
            ),
          }).toEqual({
            variants: ['complete', 'beta'],
            reportFileNames: ['bare.api.md', 'bare.beta.api.md'],
            everyReportCarriesTheInheritedDeclaration: true,
          })
        }),
      ),
    )

    scenario(
      'A configuration whose extends specifier separates with a backslash is read as a relative path, not as a package',
      Gherkin.Do.pipe(
        Given('a project whose configuration extends a backslash-separated path that is not there')(
          'review',
          () => withFixtureProject({ fixture: 'flow/config-lookup', use: reviewExtendingBackslashRelativeBase }),
        ),
        Then(
          'the review is refused because the configuration file is missing, not because a package could not be resolved',
        )(
          (s, expect) =>
            expect(failureOf(s.review.run.outcome)).toMatchObject({
              _tag: 'ConfigFileNotFound',
              candidateNames: [expect.stringContaining('absent-base.json')],
            }),
        ),
      ),
    )

    scenario(
      'A configuration that extends a package that is nowhere to be resolved is refused with the resolution failure',
      Gherkin.Do.pipe(
        Given('a project whose configuration extends a package that is not installed')(
          'review',
          () => withFixtureProject({ fixture: 'flow/config-lookup', use: reviewExtendingUnresolvableBase }),
        ),
        Then('the review is refused naming the NodeJS path that could not be resolved')((s, expect) =>
          expect(failureOf(s.review.run.outcome)).toMatchObject({
            _tag: 'ConfigExtendsResolutionError',
            specifier: 'no-such-package/api-extractor-base.json',
          })
        ),
      ),
    )

    scenario(
      'A repository configuration that declares every section loads with its sections resolved',
      Gherkin.Do.pipe(
        Given('the configuration a published workspace package commits')(
          'review',
          () => withFixtureProject({ fixture: workingPackage, use: reviewPublishedConfiguration }),
        ),
        Then('the configuration is read without a typed refusal and its report paths resolve beside the package')(
          (s, expect) => {
            const [report] = reportOutcomesOf(s.review.run)
            return expect({
              refused: failureOf(s.review.run.outcome),
              reportFileName: report?.reportFileName,
              reportSitsBesideThePackage: report?.reportPath.endsWith('/etc/npm-package.api.md'),
              draftSitsUnderTempMain: report?.reportTempPath.endsWith('/temp/main/npm-package.api.md'),
            }).toEqual({
              refused: undefined,
              reportFileName: 'npm-package.api.md',
              reportSitsBesideThePackage: true,
              draftSitsUnderTempMain: true,
            })
          },
        ),
      ),
    )

    scenarioOutline(
      'A configuration that asks for <setting> is refused',
      unrecognizedConfigurationValues,
      (row: ConfigurationRefusal) =>
        Gherkin.Do.pipe(
          Given('a project whose configuration sets a value the engine does not recognize')(
            'review',
            () => withFixtureProject({ fixture: workingPackage, use: reviewWithConfiguration(row.config) }),
          ),
          Then('the review is refused and the refusal names the configuration file')((s, expect) =>
            expect({ refused: failureOf(s.review.run.outcome) }).toMatchObject({
              refused: { _tag: row.refusal, filePath: s.review.configPath },
            })
          ),
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
        Then('the review is refused because of the unknown placeholder')((s, expect) =>
          expect(failureOf(s.review.run.outcome)).toMatchObject({
            _tag: 'UnresolvedTokenError',
            kind: 'unrecognized',
            detail: '<sourceFolder>',
            fieldName: 'mainEntryPointFilePath',
          })
        ),
      ),
    )

    scenario(
      'A configuration file that is not valid JSON is refused',
      Gherkin.Do.pipe(
        Given('a project whose configuration file stops midway through')(
          'review',
          () => withFixtureProject({ fixture: 'flow', use: reviewUnreadableConfiguration }),
        ),
        Then('the review is refused because the configuration could not be read')((s, expect) =>
          expect(failureOf(s.review.run.outcome)).toMatchObject({
            _tag: 'ConfigJsonSyntaxError',
            filePath: s.review.configPath,
          })
        ),
      ),
    )

    scenario(
      'A configuration path where no file exists is refused',
      Gherkin.Do.pipe(
        Given('a project reviewed at a configuration path that holds no file')(
          'review',
          () => withFixtureProject({ fixture: workingPackage, use: reviewMissingConfiguration }),
        ),
        Then('the review is refused because the configuration is missing')((s, expect) =>
          expect(failureOf(s.review.run.outcome)).toMatchObject({ _tag: 'ConfigFileNotFound' })
        ),
      ),
    )

    scenario(
      'Two configurations that extend each other are refused',
      Gherkin.Do.pipe(
        Given('a project holding two configurations that each extend the other')(
          'review',
          () => withFixtureProject({ fixture: workingPackage, use: reviewPairOfConfigurations }),
        ),
        Then('the review is refused and the refusal lists the configuration cycle')((s, expect) =>
          expect(failureOf(s.review.run.outcome)).toMatchObject({
            _tag: 'CircularConfigExtendsError',
            chain: [
              s.review.configPath,
              expect.stringContaining('second.json'),
              s.review.configPath,
            ],
          })
        ),
      ),
    )

    scenario(
      'A configuration whose location cannot be resolved is refused',
      Gherkin.Do.pipe(
        Given('a configuration that sits in a folder with no compiler settings anywhere above it')(
          'review',
          () => withFixtureProject({ fixture: workingPackage, use: reviewConfigurationWithoutCompilerSettings }),
        ),
        Then('the review is refused because the project folder cannot be located')((s, expect) =>
          expect(failureOf(s.review.run.outcome)).toMatchObject({
            _tag: 'ProjectFolderLookupError',
          })
        ),
      ),
    )

    scenario(
      'A configuration that asks for the doc model is refused as an unsupported feature',
      Gherkin.Do.pipe(
        Given('a project whose configuration turns the doc model on')(
          'review',
          () =>
            withFixtureProject({
              fixture: workingPackage,
              use: reviewWithConfiguration(
                '{"mainEntryPointFilePath": "<projectFolder>/lib/index.d.ts", "docModel": {"enabled": true},' +
                  ' "apiReport": {"enabled": false}, "dtsRollup": {"enabled": false}}',
              ),
            }),
        ),
        Then('the review is refused naming the unsupported feature')((s, expect) =>
          expect(failureOf(s.review.run.outcome)).toMatchObject({
            _tag: 'UnsupportedFeatureError',
            feature: 'docModel.enabled',
          })
        ),
      ),
    )
  })

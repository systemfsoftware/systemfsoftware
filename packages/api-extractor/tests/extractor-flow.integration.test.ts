import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

import {
  type ExtractionRun,
  failureOf,
  type FixtureSandbox,
  reviewFixture,
  reviewProject,
  runExtraction,
  stdoutLines,
  withFixtureProject,
  writtenFiles,
} from './__fixtures__/extractor-harness.fixture.js'
import { readTsdocMetadata } from './__fixtures__/tsdoc-metadata.fixture.js'

const Feature = makeFeature({ it })

const compilerFolderMessage = 'No usable TypeScript compiler package found in this folder'

const banner = `api-extractor ${Extractor.version}  - https://api-extractor.com/`

const cleanPackage = 'flow/simple-pkg'

const driftedPackage = 'flow/simple-pkg-drifted'

const normalPackage = 'flow/normal-verbosity'

const ansiEscape = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g')

const withoutColor = (line: string): string => line.replace(ansiEscape, '')

/** The stream's non-empty lines with terminal color codes removed: what a reader sees. */
const visibleLines = (run: ExtractionRun): readonly string[] =>
  stdoutLines(run).map(withoutColor).filter((line) => line.length > 0)

const metadataPreamble = [
  '// This file is read by tools that parse documentation comments conforming to the TSDoc standard.',
  '// It should be published with your NPM package.  It should not be tracked by Git.',
]

const withoutReportFolder = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.remove(path.join(projectRoot, 'etc'), { recursive: true })
  })

const reviewVerbosely = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const observed = yield* reviewProject({
      projectRoot,
      configPath: path.join(projectRoot, 'api-extractor.json'),
      options: { cliFlags: { verbose: true } },
    })
    return { ...observed, reportPath: path.join(projectRoot, 'etc/simple-pkg.api.md') }
  })

const reviewWithoutCompiler = ({ projectRoot }: FixtureSandbox) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    return yield* runExtraction({
      configPath: path.join(projectRoot, 'api-extractor.json'),
      options: { typescriptCompilerFolder: projectRoot, cliFlags: { verbose: true } },
    })
  })

Feature('Keeping a committed API report in step with a package\u2019s declarations')
  .live('the review runs the real extractor over a fixture project on the host filesystem')
  .withLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A quiet package whose committed report matches its declarations passes review silently and rewrites nothing but the report draft and the default metadata file',
      Gherkin.Do.pipe(
        Given('a package whose committed report matches its declarations')(
          'fixture',
          () => Effect.succeed(cleanPackage),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then(
          'the review passes silently, writes only the report draft and the metadata file the default asks for, and the draft carries the declaration',
        )(
          (s, expect) =>
            expect({
              outcome: s.observed.run.outcome,
              standardOutput: s.observed.run.stdout,
              changedOutsideTheDraftFolder: writtenFiles({ before: s.observed.before, after: s.observed.after })
                .filter((entry) => entry.split('/')[0] !== 'temp'),
              draftCarriesTheDeclaration: (s.observed.after['temp/simple-pkg.api.md'] ?? '').includes(
                'export function computeValue(input: string): number',
              ),
            }).toMatchObject({
              outcome: {
                _tag: 'Success',
                success: { _tag: 'ExtractionPassed', errorCount: 0, warningCount: 0 },
              },
              standardOutput: '',
              changedOutsideTheDraftFolder: ['lib/tsdoc-metadata.json'],
              draftCarriesTheDeclaration: true,
            }),
        ),
      ),
    )

    scenario(
      'A package whose committed report describes declarations the package no longer exports is refused in verification mode',
      Gherkin.Do.pipe(
        Given('a package whose committed report describes an interface the package no longer exports')(
          'fixture',
          () => Effect.succeed(driftedPackage),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then(
          'the review is refused as out of date, leaves the committed report untouched, and explains copying the file over',
        )(
          (s, expect) =>
            expect({
              outcome: s.observed.run.outcome,
              committedReportUntouched:
                s.observed.after['etc/simple-pkg.api.md'] === s.observed.before['etc/simple-pkg.api.md'],
              outOfDateWarningOnTheErrorStream: s.observed.run.stderr.includes(
                'You have changed the API signature for this project.',
              ),
              copyOrLocalInstructionOnTheErrorStream: s.observed.run.stderr.includes('Please copy the file'),
            }).toMatchObject({
              outcome: {
                _tag: 'Success',
                success: { _tag: 'ExtractionFailed', errorCount: 0, warningCount: 1 },
              },
              committedReportUntouched: true,
              outOfDateWarningOnTheErrorStream: true,
              copyOrLocalInstructionOnTheErrorStream: true,
            }),
        ),
      ),
    )

    scenario(
      'Reviewing as part of a local build refreshes an out-of-date committed report',
      Gherkin.Do.pipe(
        Given('a package whose committed report describes an interface the package no longer exports')(
          'fixture',
          () => Effect.succeed(driftedPackage),
        ),
        When('the package is reviewed as part of a local build')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture, options: { localBuild: true } }),
        ),
        Then('the review passes and the committed report becomes the freshly rendered report')(
          (s, expect) =>
            expect({
              outcome: s.observed.run.outcome,
              committedReportCarriesTheNewDeclaration:
                s.observed.after['etc/simple-pkg.api.md'] !== s.observed.before['etc/simple-pkg.api.md'] &&
                (s.observed.after['etc/simple-pkg.api.md'] ?? '').includes('makeSimpleWidget'),
              committedReportIsTheDraft: s.observed.after['etc/simple-pkg.api.md'] ===
                s.observed.after['temp/simple-pkg.api.md'],
            }).toMatchObject({
              outcome: { _tag: 'Success', success: { _tag: 'ExtractionPassed', errorCount: 0 } },
              committedReportCarriesTheNewDeclaration: true,
              committedReportIsTheDraft: true,
            }),
        ),
      ),
    )

    scenario(
      'Asking for the report diff over a drifted report prints the changed lines on the error stream and still leaves the committed report alone',
      Gherkin.Do.pipe(
        Given('a package whose committed report describes an interface the package no longer exports')(
          'fixture',
          () => Effect.succeed(driftedPackage),
        ),
        When('the package is reviewed asking for the report diff')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture, options: { printApiReportDiff: true } }),
        ),
        Then(
          'the review warns once more, the diff names the changed files on the error stream, and the committed report keeps its text',
        )(
          (s, expect) =>
            expect({
              outcome: s.observed.run.outcome,
              diffOnTheErrorStream: s.observed.run.stderr.includes('Changes to the API report:'),
              diffNamesTheCommittedReport: s.observed.run.stderr.includes('etc/simple-pkg.api.md'),
              diffOnStandardOutput: s.observed.run.stdout.includes('Changes to the API report:'),
              committedReportUntouched:
                s.observed.after['etc/simple-pkg.api.md'] === s.observed.before['etc/simple-pkg.api.md'],
            }).toMatchObject({
              outcome: {
                _tag: 'Success',
                success: { _tag: 'ExtractionFailed', errorCount: 0, warningCount: 2 },
              },
              diffOnTheErrorStream: true,
              diffNamesTheCommittedReport: true,
              diffOnStandardOutput: false,
              committedReportUntouched: true,
            }),
        ),
      ),
    )

    scenario(
      'Asking for the report diff over a report with no drift prints no diff anywhere',
      Gherkin.Do.pipe(
        Given('a package whose committed report matches its declarations')(
          'fixture',
          () => Effect.succeed(cleanPackage),
        ),
        When('the package is reviewed asking for the report diff')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture, options: { printApiReportDiff: true } }),
        ),
        Then('the review passes with no diff and no extra warning')((s, expect) =>
          expect({
            outcome: s.observed.run.outcome,
            diffOnTheErrorStream: s.observed.run.stderr.includes('Changes to the API report:'),
            diffOnStandardOutput: s.observed.run.stdout.includes('Changes to the API report:'),
          }).toMatchObject({
            outcome: {
              _tag: 'Success',
              success: { _tag: 'ExtractionPassed', errorCount: 0, warningCount: 0 },
            },
            diffOnTheErrorStream: false,
            diffOnStandardOutput: false,
          })
        ),
      ),
    )

    scenario(
      'A package with neither a committed report nor a report folder is refused during a local build',
      Gherkin.Do.pipe(
        Given('a package whose report folder does not exist')(
          'fixture',
          () => Effect.succeed(cleanPackage),
        ),
        When('the package is reviewed as part of a local build')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture, options: { localBuild: true }, prepare: withoutReportFolder }),
        ),
        Then('the review fails with one error and the refusal names the missing report folder')((s, expect) =>
          expect({
            outcome: s.observed.run.outcome,
            saysTheReportFileCouldNotBeCreated: s.observed.run.stderr.includes(
              'Unable to create the API report file.',
            ),
            asksForTheTargetFolder: s.observed.run.stderr.includes('Please make sure the target folder exists:'),
            namesTheReportFolder: s.observed.run.stderr.includes('/etc'),
          }).toMatchObject({
            outcome: { _tag: 'Success', success: { _tag: 'ExtractionFailed', errorCount: 1, warningCount: 0 } },
            saysTheReportFileCouldNotBeCreated: true,
            asksForTheTargetFolder: true,
            namesTheReportFolder: true,
          })
        ),
      ),
    )

    scenario(
      'A verbose review narrates the whole run on standard output and prints nothing on the error stream',
      Gherkin.Do.pipe(
        Given('a clean package reviewed with the narration turned up')(
          'fixture',
          () => Effect.succeed(cleanPackage),
        ),
        When('the package is reviewed')(
          'observed',
          (s) => withFixtureProject({ fixture: s.fixture, use: reviewVerbosely }),
        ),
        Then('the narration reaches standard output in order and the error stream stays empty')((s, expect) =>
          expect({ lines: visibleLines(s.observed.run), errorStream: s.observed.run.stderr }).toEqual({
            lines: [
              banner,
              expect.stringMatching(/^Analysis will use the bundled TypeScript version \d+\.\d+\.\d+$/),
              `Generating complete API report: ${s.observed.reportPath}`,
              'The API report is up to date: temp/simple-pkg.api.md',
              'API Extractor completed successfully',
            ],
            errorStream: '',
          })
        ),
      ),
    )

    scenario(
      'A clean review at normal verbosity narrates the run without the verbose-only report lines',
      Gherkin.Do.pipe(
        Given('a clean package reviewed with no verbosity flags and no quiet in its configuration')(
          'fixture',
          () => Effect.succeed(normalPackage),
        ),
        When('the package is reviewed')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then(
          'the review passes on standard output with the compiler version and the success line, the verbose-only report lines stay suppressed, and the error stream stays empty',
        )(
          (s, expect) =>
            expect({
              outcome: s.observed.run.outcome,
              lines: visibleLines(s.observed.run),
              errorStream: s.observed.run.stderr,
              verboseOnlyReportLines: visibleLines(s.observed.run).filter((line) =>
                line.startsWith('Generating ') || line.startsWith('The API report is up to date: ')
              ),
              written: writtenFiles({ before: s.observed.before, after: s.observed.after }),
            }).toMatchObject({
              outcome: {
                _tag: 'Success',
                success: { _tag: 'ExtractionPassed', errorCount: 0, warningCount: 0 },
              },
              lines: [
                banner,
                expect.stringMatching(/^Analysis will use the bundled TypeScript version \d+\.\d+\.\d+$/),
                'API Extractor completed successfully',
              ],
              errorStream: '',
              verboseOnlyReportLines: [],
              written: ['lib/tsdoc-metadata.json', 'temp/normal-verbosity.api.md'],
            }),
        ),
      ),
    )

    scenario(
      'A project that names a folder holding no TypeScript compiler is refused after the banner is narrated',
      Gherkin.Do.pipe(
        Given('a package whose configuration names a folder that holds no compiler')(
          'fixture',
          () => Effect.succeed(cleanPackage),
        ),
        When('the package is reviewed against that folder')(
          'observed',
          (s) => withFixtureProject({ fixture: s.fixture, use: reviewWithoutCompiler }),
        ),
        Then('the review is refused because no compiler could be loaded from that folder')(
          (s, expect) =>
            expect({
              outcome: s.observed.outcome,
              bannerOnStandardOutput: visibleLines(s.observed).includes(banner),
              errorStream: s.observed.stderr,
            }).toMatchObject({
              outcome: {
                _tag: 'Failure',
                failure: { _tag: 'TsCompilerLoadError', message: compilerFolderMessage },
              },
              bannerOnStandardOutput: true,
              errorStream: '',
            }),
        ),
      ),
    )

    scenario(
      'A configuration that supplies its own compiler settings never reads the tsconfig path it names',
      Gherkin.Do.pipe(
        Given('a package whose configuration overrides the compiler settings and names no existing tsconfig')(
          'fixture',
          () => Effect.succeed('flow/override-tsconfig'),
        ),
        When('the package is reviewed as part of a local build')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture, options: { localBuild: true } }),
        ),
        Then(
          'the review passes, renders the report from the overridden settings, and writes only the report and its draft',
        )(
          (s, expect) =>
            expect({
              outcome: s.observed.run.outcome,
              written: writtenFiles({ before: s.observed.before, after: s.observed.after }),
            }).toMatchObject({
              outcome: {
                _tag: 'Success',
                success: {
                  _tag: 'ExtractionPassed',
                  errorCount: 0,
                  outcomes: [{ _tag: 'ReportCreated', reportFileName: 'override.api.md' }],
                },
              },
              written: ['override.api.md', 'temp/override.api.md'],
            }),
        ),
      ),
    )

    scenario(
      'Compiler settings supplied by the configuration win over a tsconfig the package cannot parse',
      Gherkin.Do.pipe(
        Given(
          'a package whose configuration overrides the compiler settings and names a tsconfig that cannot be parsed',
        )(
          'fixture',
          () => Effect.succeed('flow/override-wins'),
        ),
        When('the package is reviewed as part of a local build')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture, options: { localBuild: true } }),
        ),
        Then('the review passes because the unusable tsconfig was never read')((s, expect) =>
          expect(s.observed.run.outcome).toMatchObject({
            _tag: 'Success',
            success: {
              _tag: 'ExtractionPassed',
              errorCount: 0,
              outcomes: [{ _tag: 'ReportCreated', reportFileName: 'override-wins.api.md' }],
            },
          })
        ),
      ),
    )

    scenario(
      'A tsconfig the package cannot parse is a typed refusal when the configuration supplies no compiler settings',
      Gherkin.Do.pipe(
        Given('a package whose configuration names a tsconfig that cannot be parsed')(
          'fixture',
          () => Effect.succeed('flow/unreadable-tsconfig'),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then('the review is refused with the tsconfig read error naming that file')((s, expect) =>
          expect(failureOf(s.observed.run.outcome)).toMatchObject({
            _tag: 'TsConfigReadError',
            filePath: expect.stringContaining('broken-tsconfig.json'),
          })
        ),
      ),
    )

    scenario(
      'A package whose entry point file does not exist is refused before any analysis',
      Gherkin.Do.pipe(
        Given('a package whose configuration names an entry point file that is not there')(
          'fixture',
          () => Effect.succeed('flow/missing-entry-point'),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then('the review is refused with the prepare-time error naming that file')((s, expect) =>
          expect(failureOf(s.observed.run.outcome)).toMatchObject({
            _tag: 'MainEntryPointNotFoundError',
            filePath: expect.stringContaining('lib/absent.d.ts'),
          })
        ),
      ),
    )

    scenario(
      'A configuration that leaves TSDoc metadata at its default writes it beside the package types',
      Gherkin.Do.pipe(
        Given('a package whose configuration does not mention TSDoc metadata')(
          'fixture',
          () => Effect.succeed('flow/tsdoc-metadata'),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then(
          'the review passes and the metadata file beside the package types names the standard version and this package as the writing tool',
        )(
          (s, expect) =>
            readTsdocMetadata(s.observed.after['lib/tsdoc-metadata.json'] ?? '').pipe(
              Effect.map((metadata) =>
                expect({
                  outcome: s.observed.run.outcome,
                  written: writtenFiles({ before: s.observed.before, after: s.observed.after }),
                  metadata,
                }).toMatchObject({
                  outcome: {
                    _tag: 'Success',
                    success: {
                      _tag: 'ExtractionPassed',
                      errorCount: 0,
                      warningCount: 0,
                      outcomes: [],
                    },
                  },
                  written: ['lib/tsdoc-metadata.json'],
                  metadata: {
                    preamble: metadataPreamble,
                    metadata: {
                      tsdocVersion: '0.12',
                      toolPackages: [
                        {
                          packageName: '@systemfsoftware/api-extractor',
                          packageVersion: Extractor.version,
                        },
                      ],
                    },
                  },
                })
              ),
            ),
        ),
      ),
    )

    scenario(
      'A package that declares its entry point only through an "exports" map gets its metadata beside the export target',
      Gherkin.Do.pipe(
        Given('a package whose package.json declares an "exports" map and no "types" field')(
          'fixture',
          () => Effect.succeed('flow/tsdoc-metadata-exports'),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then('the review passes and the metadata file sits in the folder the export target names')((s, expect) =>
          expect({
            outcome: s.observed.run.outcome,
            written: writtenFiles({ before: s.observed.before, after: s.observed.after }),
          }).toMatchObject({
            outcome: {
              _tag: 'Success',
              success: {
                _tag: 'ExtractionPassed',
                errorCount: 0,
                warningCount: 0,
              },
            },
            written: ['lib/tsdoc-metadata.json'],
          })
        ),
      ),
    )
  })

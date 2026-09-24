import * as NodeServices from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

import {
  changedEntries,
  type FixtureSandbox,
  reviewFixture,
  reviewProject,
  runExtraction,
  stdoutLines,
  withFixtureProject,
} from './__fixtures__/extractor-harness.js'

const Feature = makeFeature({ it })

const compilerFolderMessage = 'No usable TypeScript compiler package found in this folder'

const cleanPackage = 'extractor-flow/simple-pkg'

const driftedPackage = 'extractor-flow/simple-pkg-drifted'

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
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A package whose committed report matches its declarations passes review and rewrites nothing outside the report draft folder',
      Gherkin.Do.pipe(
        Given('a package whose committed report matches its declarations')(
          'fixture',
          () => Effect.succeed(cleanPackage),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture({ fixture: s.fixture }),
        ),
        Then('the review passes without errors or warnings')((s) => {
          expect(s.observed.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionPassed', errorCount: 0, warningCount: 0 },
          })
        }),
        Then('nothing outside the report draft folder changed')((s) => {
          expect(
            changedEntries({ before: s.observed.before, after: s.observed.after }).filter((entry) =>
              entry.split('/')[0] !== 'temp'
            ),
          ).toEqual([])
        }),
        Then('the report draft carries the declaration the report promises')((s) => {
          expect(s.observed.after['temp/simple-pkg.api.md']).toContain(
            'export function computeValue(input: string): number',
          )
        }),
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
        Then('the review fails because the committed report is out of date')((s) => {
          expect(s.observed.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionFailed', errorCount: 0, warningCount: 1 },
          })
        }),
        Then('the committed report is left untouched')((s) => {
          expect(s.observed.after['etc/simple-pkg.api.md']).toBe(s.observed.before['etc/simple-pkg.api.md'])
        }),
        Then('the reviewer explains that the report must be copied over or the build run locally')((s) => {
          expect(s.observed.run.stdout).toContain('You have changed the API signature for this project.')
          expect(s.observed.run.stdout).toContain('Please copy the file')
        }),
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
        Then('the review passes')((s) => {
          expect(s.observed.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionPassed', errorCount: 0 },
          })
        }),
        Then('the committed report now describes the declarations the package exports today')((s) => {
          expect(s.observed.after['etc/simple-pkg.api.md']).not.toBe(s.observed.before['etc/simple-pkg.api.md'])
          expect(s.observed.after['etc/simple-pkg.api.md']).toContain('makeSimpleWidget')
        }),
        Then('the committed report is the freshly rendered report')((s) => {
          expect(s.observed.after['etc/simple-pkg.api.md']).toBe(s.observed.after['temp/simple-pkg.api.md'])
        }),
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
        Then('the review fails with a single error and no warnings')((s) => {
          expect(s.observed.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionFailed', errorCount: 1, warningCount: 0 },
          })
        }),
        Then('the refusal names the report folder that does not exist')((s) => {
          expect(s.observed.run.stderr).toContain('Unable to create the API report file.')
          expect(s.observed.run.stderr).toContain('Please make sure the target folder exists:')
          expect(s.observed.run.stderr).toContain('/etc')
        }),
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
        Then('the narration opens with the tool banner and the configuration it read')((s) => {
          const lines = stdoutLines(s.observed.run)
          expect(lines[0]).toBe(`api-extractor ${Extractor.version} - https://api-extractor.com/`)
          expect(lines[1]).toBe(`Using configuration from ${s.observed.configPath}`)
        }),
        Then(
          'the narration continues with the compiler preamble, the report lines, and the closing footer in that order',
        )((s) => {
          expect(stdoutLines(s.observed.run)).toEqual([
            `api-extractor ${Extractor.version} - https://api-extractor.com/`,
            `Using configuration from ${s.observed.configPath}`,
            expect.stringMatching(/^Analysis will use the bundled TypeScript version \d+\.\d+\.\d+$/),
            `Generating complete API report: ${s.observed.reportPath}`,
            'The API report is up to date: temp/simple-pkg.api.md',
            'API Extractor completed successfully',
          ])
        }),
        Then('the error stream stays empty')((s) => {
          expect(s.observed.run.stderr).toBe('')
        }),
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
        Then('the review is refused because no compiler could be loaded from that folder')((s) => {
          expect(s.observed.outcome).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'TsCompilerLoadError', message: compilerFolderMessage },
          })
        }),
        Then('the banner had already reached standard output and the error stream stayed empty')((s) => {
          expect(s.observed.stdout).toContain(`api-extractor ${Extractor.version} - https://api-extractor.com/`)
          expect(s.observed.stderr).toBe('')
        }),
      ),
    )
  })

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import * as Path from 'effect/Path'

import {
  readFixtureFile,
  type ReviewObservation,
  reviewProject,
  withFixtureProject,
} from './__fixtures__/extractor-harness.js'

const Feature = makeFeature({ it })

const analyzerPackage = 'analyzer'

const analyzerReportPath = 'temp/analyzer-fixture.api.md'

interface AnalyzerReview {
  readonly run: ReviewObservation
  readonly committedReport: string
}

const reviewAnalyzerPackage = () =>
  withFixtureProject({
    fixture: analyzerPackage,
    use: ({ projectRoot }) =>
      Effect.gen(function*() {
        const path = yield* Path.Path
        const run = yield* reviewProject({ projectRoot, configPath: path.join(projectRoot, 'api-extractor.json') })
        const committedReport = yield* readFixtureFile({
          fixture: analyzerPackage,
          relativePath: 'expected/analyzer-fixture.api.md',
        })
        return { run, committedReport } satisfies AnalyzerReview
      }),
  })

Feature('Reporting what a package\u2019s entry point leaves out')
  .live('the review runs the real extractor over a fixture project on the host filesystem')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A declaration the entry point uses but never exports is called out in the report',
      Gherkin.Do.pipe(
        Given('a package whose entry point returns a type it never exports')(
          'review',
          () => reviewAnalyzerPackage(),
        ),
        Then('the review is refused because the package has committed no report yet')((s) => {
          expect(s.review.run.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionFailed', errorCount: 0 },
          })
        }),
        Then('the report names the symbol the entry point never exports')((s) => {
          expect(s.review.run.after[analyzerReportPath]).toContain('(ae-forgotten-export)')
          expect(s.review.run.after[analyzerReportPath]).toContain('"ForgottenType"')
        }),
        Then('the rendered report is byte for byte the committed report')((s) => {
          expect(s.review.run.after[analyzerReportPath]).toBe(s.review.committedReport)
        }),
      ),
    )

    scenario(
      'A namespace the entry point re-exports is described under its own block',
      Gherkin.Do.pipe(
        Given('a package whose entry point re-exports a namespace of registry entries')(
          'review',
          () => reviewAnalyzerPackage(),
        ),
        Then('the report describes the re-exported namespace under its own block')((s) => {
          expect(s.review.run.after[analyzerReportPath]).toContain('declare namespace Registry {')
          expect(s.review.run.after[analyzerReportPath]).toContain('Registry_2 as Registry')
        }),
        Then('the report lists the members the namespace exposes')((s) => {
          expect(s.review.run.after[analyzerReportPath]).toContain('export const Atom')
          expect(s.review.run.after[analyzerReportPath]).toContain('export function useForgotten()')
        }),
      ),
    )
  })

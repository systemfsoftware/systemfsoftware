import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Ts from 'typescript'

import {
  readFixtureFile,
  type ReviewObservation,
  reviewProject,
  withFixtureProject,
} from './__fixtures__/extractor-harness.fixture.js'

const Feature = makeFeature({ it })

interface RollupReview {
  readonly run: ReviewObservation
  readonly emitted: string
  readonly committed: string
}

const reviewRollup = (fixture: string, bundleName: string) =>
  withFixtureProject({
    fixture,
    use: ({ projectRoot }) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const run = yield* reviewProject({ projectRoot, configPath: path.join(projectRoot, 'api-extractor.json') })
        const emitted = yield* fs.readFileString(path.join(projectRoot, 'dist', bundleName))
        const committed = yield* readFixtureFile({ fixture, relativePath: `expected/${bundleName}` })
        return { run, emitted, committed } satisfies RollupReview
      }),
  })

const diagnosticsOf = (declarationText: string): readonly string[] => {
  const options: Ts.CompilerOptions = {
    target: Ts.ScriptTarget.ES2022,
    module: Ts.ModuleKind.NodeNext,
    moduleResolution: Ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
  }
  const fileName = 'bundle.d.ts'
  const sourceFile = Ts.createSourceFile(fileName, declarationText, Ts.ScriptTarget.ES2022, true)
  const defaultHost = Ts.createCompilerHost(options)
  const host: Ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (name, languageVersion, onError, shouldCreateNewSourceFile) =>
      name === fileName
        ? sourceFile
        : defaultHost.getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile),
  }
  const program = Ts.createProgram({ rootNames: [fileName], options, host })
  return Ts.getPreEmitDiagnostics(program).map((diagnostic) =>
    Ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  )
}

const bundleReviewOf = (s: { review: RollupReview }) => ({
  outcome: s.review.run.run.outcome,
  bundle: s.review.emitted,
  diagnostics: diagnosticsOf(s.review.emitted),
})

Feature('Bundling a package\u2019s declarations with namespace exports')
  .live('the review runs the real extractor over a fixture project on the host filesystem')
  .withLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A namespace barrel whose members import back is bundled into a rollup that compiles cleanly',
      Gherkin.Do.pipe(
        Given('a package whose entry point re-exports a namespace that refers back to the entry point')(
          'review',
          () => reviewRollup('rollup/ae3', 'ae3.d.ts'),
        ),
        Then(
          'the review passes, the rollup is byte for byte the committed bundle, and it compiles with no diagnostics',
        )(
          (s, expect) =>
            expect(bundleReviewOf(s)).toMatchObject({
              outcome: { _tag: 'Success', success: { _tag: 'ExtractionPassed', errorCount: 0 } },
              bundle: s.review.committed,
              diagnostics: [],
            }),
        ),
      ),
    )

    scenario(
      'A namespace that re-exports another namespace keeps the inner namespace reachable',
      Gherkin.Do.pipe(
        Given('a package whose entry point re-exports a namespace that itself re-exports a namespace')(
          'review',
          () => reviewRollup('rollup/nested', 'nested.d.ts'),
        ),
        Then(
          'the review passes, the rollup is byte for byte the committed bundle, and it compiles with no diagnostics',
        )(
          (s, expect) =>
            expect(bundleReviewOf(s)).toMatchObject({
              outcome: { _tag: 'Success', success: { _tag: 'ExtractionPassed', errorCount: 0 } },
              bundle: s.review.committed,
              diagnostics: [],
            }),
        ),
      ),
    )

    scenario(
      'A namespace that re-exports a whole module carries its members into the namespace block',
      Gherkin.Do.pipe(
        Given('a package whose entry point re-exports a namespace that re-exports a whole module')(
          'review',
          () => reviewRollup('rollup/star', 'star.d.ts'),
        ),
        Then(
          'the review passes, the rollup is byte for byte the committed bundle, and it compiles with no diagnostics',
        )(
          (s, expect) =>
            expect(bundleReviewOf(s)).toMatchObject({
              outcome: { _tag: 'Success', success: { _tag: 'ExtractionPassed', errorCount: 0 } },
              bundle: s.review.committed,
              diagnostics: [],
            }),
        ),
      ),
    )
  })

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Ts from 'typescript'
import { expect } from 'vitest'

import {
  readFixtureFile,
  type ReviewObservation,
  reviewProject,
  withFixtureProject,
} from './__fixtures__/extractor-harness.js'

const Feature = makeFeature({ it, layer })

interface RollupReview {
  readonly run: ReviewObservation
  readonly emitted: string
  readonly committed: string
}

const reviewRollup = (fixture: string, rollupPath: string) =>
  withFixtureProject(fixture, ({ projectRoot }) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const run = yield* reviewProject(projectRoot, path.join(projectRoot, 'api-extractor.json'))
      const emitted = yield* fs.readFileString(path.join(projectRoot, rollupPath))
      const committed = yield* readFixtureFile(fixture, rollupPath)
      return { run, emitted, committed } satisfies RollupReview
    }))

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

Feature('Bundling a package\u2019s declarations with namespace exports')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A namespace barrel whose members import back is bundled into a rollup that compiles cleanly',
      Gherkin.Do.pipe(
        Given('a package whose entry point re-exports a namespace that refers back to the entry point')(
          'review',
          () => reviewRollup('rollup/ae3', 'dist/ae3.d.ts'),
        ),
        Then('the review passes without errors')((s) => {
          expect(s.review.run.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionPassed', errorCount: 0 },
          })
        }),
        Then('the rollup is byte for byte the committed bundle')((s) => {
          expect(s.review.emitted).toBe(s.review.committed)
        }),
        Then('the namespace members are hoisted under prefixed names and re-exported by the namespace block')((s) => {
          expect(s.review.emitted).toContain('type Ns_Registry = Registry;')
          expect(s.review.emitted).toContain('declare const Ns_DEFAULT_REGISTRY: typeof DEFAULT_REGISTRY;')
          expect(s.review.emitted).toContain('declare const Ns_createRegistry: typeof createRegistry;')
          expect(s.review.emitted).toContain('type Ns_AtomContainer = AtomContainer;')
          expect(s.review.emitted).toContain('declare const Ns_AtomContainer: typeof AtomContainer;')
          expect(s.review.emitted).toContain('export declare namespace Ns {')
          expect(s.review.emitted).toContain('Ns_createRegistry as createRegistry')
          expect(s.review.emitted).toContain('Ns_Registry as Registry')
        }),
        Then('the bundle compiles with no diagnostics')((s) => {
          expect(diagnosticsOf(s.review.emitted)).toEqual([])
        }),
      ),
    )

    scenario(
      'A namespace that re-exports another namespace keeps the inner namespace reachable',
      Gherkin.Do.pipe(
        Given('a package whose entry point re-exports a namespace that itself re-exports a namespace')(
          'review',
          () => reviewRollup('rollup/nested', 'dist/nested.d.ts'),
        ),
        Then('the review passes without errors')((s) => {
          expect(s.review.run.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionPassed', errorCount: 0 },
          })
        }),
        Then('the rollup is byte for byte the committed bundle')((s) => {
          expect(s.review.emitted).toBe(s.review.committed)
        }),
        Then('the inner namespace is aliased and re-exported by the outer namespace block')((s) => {
          expect(s.review.emitted).toContain('import Root_Inner = Inner;')
          expect(s.review.emitted).toContain('export declare namespace Root {')
          expect(s.review.emitted).toContain('Root_Inner as Inner')
        }),
      ),
    )

    scenario(
      'A namespace that re-exports a whole module carries its members into the namespace block',
      Gherkin.Do.pipe(
        Given('a package whose entry point re-exports a namespace that re-exports a whole module')(
          'review',
          () => reviewRollup('rollup/star', 'dist/star.d.ts'),
        ),
        Then('the review passes without errors')((s) => {
          expect(s.review.run.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionPassed', errorCount: 0 },
          })
        }),
        Then('the rollup is byte for byte the committed bundle')((s) => {
          expect(s.review.emitted).toBe(s.review.committed)
        }),
        Then('the module members are hoisted and re-exported by the namespace block')((s) => {
          expect(s.review.emitted).toContain('type StarNs_StarPayload = StarPayload;')
          expect(s.review.emitted).toContain('declare const StarNs_makePayload: typeof makePayload;')
          expect(s.review.emitted).toContain('export declare namespace StarNs {')
          expect(s.review.emitted).toContain('StarNs_StarPayload as StarPayload')
        }),
      ),
    )
  })

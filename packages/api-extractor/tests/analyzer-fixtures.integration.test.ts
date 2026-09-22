import * as NodeServices from '@effect/platform-node/NodeServices'
import {
  AstNamespaceExport,
  Collector,
  DocCommentEnhancer,
  loadCompilerState,
  loadExtractorConfig,
  makeMessageRouter,
  MessageWriter,
  SourceMapper,
  ValidationEnhancer,
} from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Path from 'effect/Path'
import { expect } from 'vitest'

interface RecordedLog {
  readonly level: string
  readonly text: string
}

const Feature = makeFeature({ it, layer })

const fixturesUrl = new URL('__fixtures__/analyzer/', import.meta.url)

const resolveFixturePath = (relative: string): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = yield* path.fromFileUrl(fixturesUrl).pipe(
      Effect.orElseSucceed(() => ''),
    )
    return path.resolve(root, relative)
  })

const analyzeFixturePackage = (configPath: string) =>
  Effect.gen(function*() {
    const recordedLogs: RecordedLog[] = []
    const router = yield* makeMessageRouter({
      cliFlags: { verbose: true },
    }).pipe(
      Effect.provideService(MessageWriter, {
        write: (level, text) =>
          Effect.sync(() => {
            recordedLogs.push({ level, text })
          }),
      }),
    )

    const config = yield* loadExtractorConfig(configPath)
    const compilerState = yield* loadCompilerState({
      projectFolder: config.projectFolder,
      tsconfigFilePath: config.tsconfigFilePath,
      mainEntryPointFilePath: config.mainEntryPointFilePath,
      skipLibCheck: config.skipLibCheck,
    })

    const sourceMapper = new SourceMapper()
    const collector = new Collector({
      program: compilerState.program,
      extractorConfig: config,
      messageRouter: router,
      sourceMapper,
    })

    collector.analyze()
    DocCommentEnhancer.analyze(collector)
    ValidationEnhancer.analyze(collector)

    return {
      collector,
      recordedLogs,
    }
  })

Feature('Analyzing TypeScript declaration exports and namespace barrels')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A package with namespace exports and internal type references resolves its full entity graph',
      Gherkin.Do.pipe(
        Given('a configuration file declaring a package with namespace exports and back-imports')(
          'configPath',
          () => resolveFixturePath('api-extractor.json'),
        ),
        When('the symbol graph is extracted from declaration entry points')(
          'analysis',
          (s) => analyzeFixturePackage(s.configPath),
        ),
        Then('the namespace export entity is present in the collected entities')(
          (s) => {
            const namespaceEntity = s.analysis.collector.entities.find(
              (e) => e.astEntity instanceof AstNamespaceExport,
            )
            expect(namespaceEntity).toBeDefined()
            expect(namespaceEntity?.nameForEmit).toBe('Registry')
            expect(namespaceEntity?.shouldInlineExport).toBe(true)
          },
        ),
        Then('all exported declarations and resolved imports match the expected topology')(
          (s) => {
            const summary = s.analysis.collector.entities.map((e) => ({
              exportNames: Array.from(e.exportNames),
              isNamespaceExport: e.astEntity instanceof AstNamespaceExport,
              nameForEmit: e.nameForEmit,
              shouldInlineExport: e.shouldInlineExport,
            }))

            expect(summary).toEqual([
              {
                exportNames: ['Atom'],
                isNamespaceExport: false,
                nameForEmit: 'Atom',
                shouldInlineExport: true,
              },
              {
                exportNames: [],
                isNamespaceExport: false,
                nameForEmit: 'ForgottenType',
                shouldInlineExport: false,
              },
              {
                exportNames: ['Registry'],
                isNamespaceExport: true,
                nameForEmit: 'Registry',
                shouldInlineExport: true,
              },
              {
                exportNames: [],
                isNamespaceExport: false,
                nameForEmit: 'Registry_2',
                shouldInlineExport: false,
              },
              {
                exportNames: [],
                isNamespaceExport: false,
                nameForEmit: 'RegistryEntry',
                shouldInlineExport: false,
              },
              {
                exportNames: ['useForgotten'],
                isNamespaceExport: false,
                nameForEmit: 'useForgotten',
                shouldInlineExport: true,
              },
            ])
          },
        ),
      ),
    )

    scenario(
      'A referenced declaration missing from package exports is surfaced as a diagnostic warning',
      Gherkin.Do.pipe(
        Given('a configuration file whose entry point references an unexported type')(
          'configPath',
          () => resolveFixturePath('api-extractor.json'),
        ),
        When('the package analysis pipeline runs')(
          'analysis',
          (s) => analyzeFixturePackage(s.configPath),
        ),
        Then('a forgotten export diagnostic message is recorded without halting execution')(
          (s) => {
            const warning = s.analysis.recordedLogs.find(
              (l) => l.text.includes('ae-forgotten-export') && l.text.includes('ForgottenType'),
            )
            expect(warning).toBeDefined()
            expect(warning?.level).toBe('warning')
          },
        ),
      ),
    )
  })

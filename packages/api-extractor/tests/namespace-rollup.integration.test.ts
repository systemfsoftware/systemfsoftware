import * as NodeServices from '@effect/platform-node/NodeServices'
import {
  Collector,
  DtsRollupGenerator,
  DtsRollupKind,
  ExtractionPassed,
  loadCompilerState,
  loadExtractorConfig,
  makeMessageView,
  MessageLog,
  MessageWriter,
  runEffect,
  SourceMapper,
} from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as ts from 'typescript'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const fixturesUrl = new URL('__fixtures__/rollup/', import.meta.url)

const resolveFixturePath = (relative: string): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = yield* path.fromFileUrl(fixturesUrl).pipe(
      Effect.orElseSucceed(() => ''),
    )
    return path.resolve(root, relative)
  })

const compileDtsInProcess = (dtsContent: string): readonly ts.Diagnostic[] => {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    declaration: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
  }

  const fileName = '/virtual/bundle.d.ts'
  const sourceFile = ts.createSourceFile(fileName, dtsContent, ts.ScriptTarget.ES2022, true)

  const defaultHost = ts.createCompilerHost(options)
  const customHost: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (name, target) => {
      if (name === fileName) {
        return sourceFile
      }
      return defaultHost.getSourceFile(name, target)
    },
    fileExists: (name) => (name === fileName ? true : defaultHost.fileExists(name)),
    readFile: (name) => (name === fileName ? dtsContent : defaultHost.readFile(name)),
  }

  const program = ts.createProgram([fileName], options, customHost)
  return ts.getPreEmitDiagnostics(program)
}

Feature('Bundling declaration files with namespace exports')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'Compiling a namespace export produces self-contained declarations',
      Gherkin.Do.pipe(
        Given('a package with a namespace barrel and reciprocal imports')(
          'configPath',
          () => resolveFixturePath('ae3/api-extractor.json'),
        ),
        When('the declaration rollup is generated from the entry point')(
          'emitted',
          (s) =>
            Effect.gen(function*() {
              const config = yield* loadExtractorConfig(s.configPath)
              const compilerState = yield* loadCompilerState({
                projectFolder: config.projectFolder,
                tsconfigFilePath: config.tsconfigFilePath,
                mainEntryPointFilePath: config.mainEntryPointFilePath,
                skipLibCheck: config.skipLibCheck,
              })
              const sourceMapper = new SourceMapper()
              const messageLog = new MessageLog({ diagnostics: false })
              const reportMessages = Result.getOrThrow(
                makeMessageView({
                  log: messageLog,
                  messagesConfig: config.messages,
                  reportEnabled: false,
                  workingPackageFolder: config.projectFolder,
                }),
              )
              const collector = new Collector({
                program: compilerState.program,
                extractorConfig: config,
                messageLog,
                reportMessages,
                sourceMapper,
              })
              collector.analyze()
              const content = DtsRollupGenerator.generateTypingsFileContent(
                collector,
                DtsRollupKind.InternalRelease,
              )
              return { content }
            }),
        ),
        Then('the namespace members are hoisted to top-level aliases')((s) => {
          expect(s.emitted.content).toContain('type Ns_Registry = Registry;')
          expect(s.emitted.content).toContain('declare const Ns_DEFAULT_REGISTRY: typeof DEFAULT_REGISTRY;')
          expect(s.emitted.content).toContain('declare const Ns_createRegistry: typeof createRegistry;')
          expect(s.emitted.content).toContain('type Ns_AtomContainer = AtomContainer;')
          expect(s.emitted.content).toContain('declare const Ns_AtomContainer: typeof AtomContainer;')
        }),
        Then('the namespace block re-exports every hoisted alias')((s) => {
          expect(s.emitted.content).toContain('export declare namespace Ns {')
          expect(s.emitted.content).toContain('Ns_Registry as Registry')
          expect(s.emitted.content).toContain('Ns_DEFAULT_REGISTRY as DEFAULT_REGISTRY')
          expect(s.emitted.content).toContain('Ns_createRegistry as createRegistry')
          expect(s.emitted.content).toContain('Ns_AtomContainer as AtomContainer')
        }),
        Then('the resulting declaration bundle compiles with zero diagnostics')((s) => {
          const diagnostics = compileDtsInProcess(s.emitted.content)
          expect(diagnostics.length).toBe(0)
        }),
      ),
    )

    scenario(
      'Exporting nested namespaces preserves the structural hierarchy',
      Gherkin.Do.pipe(
        Given('a package with nested namespace exports')(
          'configPath',
          () => resolveFixturePath('nested/api-extractor.json'),
        ),
        When('the declaration rollup is generated from the entry point')(
          'emitted',
          (s) =>
            Effect.gen(function*() {
              const config = yield* loadExtractorConfig(s.configPath)
              const compilerState = yield* loadCompilerState({
                projectFolder: config.projectFolder,
                tsconfigFilePath: config.tsconfigFilePath,
                mainEntryPointFilePath: config.mainEntryPointFilePath,
                skipLibCheck: config.skipLibCheck,
              })
              const sourceMapper = new SourceMapper()
              const messageLog = new MessageLog({ diagnostics: false })
              const reportMessages = Result.getOrThrow(
                makeMessageView({
                  log: messageLog,
                  messagesConfig: config.messages,
                  reportEnabled: false,
                  workingPackageFolder: config.projectFolder,
                }),
              )
              const collector = new Collector({
                program: compilerState.program,
                extractorConfig: config,
                messageLog,
                reportMessages,
                sourceMapper,
              })
              collector.analyze()
              const content = DtsRollupGenerator.generateTypingsFileContent(
                collector,
                DtsRollupKind.InternalRelease,
              )
              return { content }
            }),
        ),
        Then('the inner namespace is aliased through an import equals statement')((s) => {
          expect(s.emitted.content).toContain('import Root_Inner = Inner;')
        }),
        Then('the outer namespace re-exports the aliased inner namespace')((s) => {
          expect(s.emitted.content).toContain('export declare namespace Root {')
          expect(s.emitted.content).toContain('Root_Inner as Inner')
        }),
      ),
    )

    scenario(
      'A namespace re-exporting another module preserves exported members',
      Gherkin.Do.pipe(
        Given('a package whose namespace re-exports an internal module')(
          'configPath',
          () => resolveFixturePath('star/api-extractor.json'),
        ),
        When('the declaration rollup is generated from the entry point')(
          'emitted',
          (s) =>
            Effect.gen(function*() {
              const config = yield* loadExtractorConfig(s.configPath)
              const compilerState = yield* loadCompilerState({
                projectFolder: config.projectFolder,
                tsconfigFilePath: config.tsconfigFilePath,
                mainEntryPointFilePath: config.mainEntryPointFilePath,
                skipLibCheck: config.skipLibCheck,
              })
              const sourceMapper = new SourceMapper()
              const messageLog = new MessageLog({ diagnostics: false })
              const reportMessages = Result.getOrThrow(
                makeMessageView({
                  log: messageLog,
                  messagesConfig: config.messages,
                  reportEnabled: false,
                  workingPackageFolder: config.projectFolder,
                }),
              )
              const collector = new Collector({
                program: compilerState.program,
                extractorConfig: config,
                messageLog,
                reportMessages,
                sourceMapper,
              })
              collector.analyze()
              const content = DtsRollupGenerator.generateTypingsFileContent(
                collector,
                DtsRollupKind.InternalRelease,
              )
              return { content }
            }),
        ),
        Then('the exported members are discovered and aliased inside the namespace')((s) => {
          expect(s.emitted.content).toContain('type StarNs_StarPayload = StarPayload;')
          expect(s.emitted.content).toContain('declare const StarNs_makePayload: typeof makePayload;')
          expect(s.emitted.content).toContain('declare const StarNs_STAR_VERSION: typeof STAR_VERSION;')
          expect(s.emitted.content).toContain('export declare namespace StarNs {')
          expect(s.emitted.content).toContain('StarNs_StarPayload as StarPayload')
        }),
      ),
    )

    scenario(
      'A full extraction run writes the configured declaration rollup file',
      Gherkin.Do.pipe(
        Given('a package configured to emit an untrimmed declaration rollup')(
          'configPath',
          () => resolveFixturePath('ae3/api-extractor.json'),
        ),
        When('the extraction process runs with chatter suppression')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem.FileSystem
              const messages: string[] = []
              const writer: MessageWriter = {
                write: (level, text) =>
                  Effect.sync(() => {
                    messages.push(text)
                  }),
              }
              const result = yield* runEffect(s.configPath).pipe(
                Effect.provideService(MessageWriter, writer),
              )
              const path = yield* Path.Path
              const projectDir = path.dirname(s.configPath)
              const dtsPath = path.resolve(projectDir, 'dist/ae3.d.ts')
              const exists = yield* fs.exists(dtsPath)
              const content = exists ? yield* fs.readFileString(dtsPath) : ''
              return { result, dtsPath, exists, content, messages }
            }),
        ),
        Then('the extraction completes cleanly with zero errors')((s) => {
          if (!Schema.is(ExtractionPassed)(s.outcome.result)) {
            throw new Error(
              `Run failed (errors=${s.outcome.result.errorCount}, warnings=${s.outcome.result.warningCount}):\n${
                s.outcome.messages.join('\n')
              }`,
            )
          }
          expect(Schema.is(ExtractionPassed)(s.outcome.result)).toBe(true)
        }),
        Then('the declaration rollup file is written to the expected path')((s) => {
          expect(s.outcome.exists).toBe(true)
          expect(s.outcome.content.length).toBeGreaterThan(0)
          expect(s.outcome.content).toContain('export declare namespace Ns {')
        }),
      ),
    )
  })

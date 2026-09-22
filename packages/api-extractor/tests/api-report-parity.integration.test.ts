import * as NodeServices from '@effect/platform-node/NodeServices'
import {
  ApiReportGenerator,
  Collector,
  convertNewlines,
  DocCommentEnhancer,
  loadCompilerState,
  loadExtractorConfig,
  makeMessageRouter,
  MessageWriter,
  runGenerators,
  SourceMapper,
  ValidationEnhancer,
} from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const fixtureConfigUrl = new URL('__fixtures__/report-parity/simple-pkg/api-extractor.json', import.meta.url)

interface FixtureAnalysis {
  readonly collector: Collector
  readonly configPath: string
  readonly expectedCompleteBytes: Buffer
  readonly expectedPublicBytes: Buffer
  readonly expectedBetaBytes: Buffer
}

const analyzeSimplePackage = () =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem

    const configPath = yield* path.fromFileUrl(fixtureConfigUrl).pipe(
      Effect.orElseSucceed(() => ''),
    )

    const router = yield* makeMessageRouter({
      cliFlags: { verbose: true },
    }).pipe(
      Effect.provideService(MessageWriter, {
        write: () => Effect.void,
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

    const projectDir = config.projectFolder
    const completeFilePath = path.resolve(projectDir, 'etc/simple-pkg.api.md')
    const publicFilePath = path.resolve(projectDir, 'etc/simple-pkg.public.api.md')
    const betaFilePath = path.resolve(projectDir, 'etc/simple-pkg.beta.api.md')

    const completeRaw = yield* fs.readFile(completeFilePath)
    const publicRaw = yield* fs.readFile(publicFilePath)
    const betaRaw = yield* fs.readFile(betaFilePath)

    return {
      collector,
      configPath,
      expectedCompleteBytes: Buffer.from(completeRaw),
      expectedPublicBytes: Buffer.from(publicRaw),
      expectedBetaBytes: Buffer.from(betaRaw),
    } satisfies FixtureAnalysis
  })

Feature('Generating API report files for TypeScript packages')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A complete package report contains all exported members matching the baseline',
      Gherkin.Do.pipe(
        Given('a configured package declaring public, beta, and internal exports')(
          'analysis',
          () => analyzeSimplePackage(),
        ),
        When('the API report generator processes the package with the complete release level')(
          'report',
          (s) =>
            Effect.sync(() => {
              const content = ApiReportGenerator.generateReviewFileContent(s.analysis.collector, 'complete')
              const converted = convertNewlines(content, s.analysis.collector.extractorConfig.newlineKind)
              return {
                content,
                bytes: Buffer.from(converted),
              }
            }),
        ),
        Then('the generated report matches the committed baseline bytes exactly')((s) => {
          expect(Buffer.compare(s.report.bytes, s.analysis.expectedCompleteBytes)).toBe(0)
        }),
        Then('the report includes all release tags and member declarations')((s) => {
          expect(s.report.content).toContain('class BetaFeature')
          expect(s.report.content).toContain('function computeValue')
          expect(s.report.content).toContain('function internalHelper')
          expect(s.report.content).toContain('namespace SimpleNamespace')
          expect(s.report.content).toContain('type SimpleId')
          expect(s.report.content).toContain('interface SimpleOptions')
          expect(s.report.content).toContain('class SimpleService')
          expect(s.report.content).toContain('// @internal')
          expect(s.report.content).toContain('// @beta')
          expect(s.report.content).toContain('// @public')
        }),
      ),
    )

    scenario(
      'A public release report trims internal and beta members',
      Gherkin.Do.pipe(
        Given('a configured package declaring public, beta, and internal exports')(
          'analysis',
          () => analyzeSimplePackage(),
        ),
        When('the API report generator processes the package with the public release level')(
          'report',
          (s) =>
            Effect.sync(() => {
              const content = ApiReportGenerator.generateReviewFileContent(s.analysis.collector, 'public')
              const converted = convertNewlines(content, s.analysis.collector.extractorConfig.newlineKind)
              return {
                content,
                bytes: Buffer.from(converted),
              }
            }),
        ),
        Then('the generated report matches the committed public baseline bytes exactly')((s) => {
          expect(Buffer.compare(s.report.bytes, s.analysis.expectedPublicBytes)).toBe(0)
        }),
        Then('the report omits internal and beta declarations')((s) => {
          expect(s.report.content).not.toContain('BetaFeature')
          expect(s.report.content).not.toContain('internalHelper')
          expect(s.report.content).toContain('computeValue')
          expect(s.report.content).toContain('SimpleNamespace')
          expect(s.report.content).toContain('SimpleService')
        }),
      ),
    )

    scenario(
      'A beta release report includes beta declarations but trims internal members',
      Gherkin.Do.pipe(
        Given('a configured package declaring public, beta, and internal exports')(
          'analysis',
          () => analyzeSimplePackage(),
        ),
        When('the API report generator processes the package with the beta release level')(
          'report',
          (s) =>
            Effect.sync(() => {
              const content = ApiReportGenerator.generateReviewFileContent(s.analysis.collector, 'beta')
              const converted = convertNewlines(content, s.analysis.collector.extractorConfig.newlineKind)
              return {
                content,
                bytes: Buffer.from(converted),
              }
            }),
        ),
        Then('the generated report matches the committed beta baseline bytes exactly')((s) => {
          expect(Buffer.compare(s.report.bytes, s.analysis.expectedBetaBytes)).toBe(0)
        }),
        Then('the report contains beta declarations while omitting internal members')((s) => {
          expect(s.report.content).toContain('class BetaFeature')
          expect(s.report.content).toContain('// @beta')
          expect(s.report.content).not.toContain('internalHelper')
          expect(s.report.content).toContain('computeValue')
          expect(s.report.content).toContain('SimpleNamespace')
        }),
      ),
    )

    scenario(
      'An existing up-to-date report is recognized as unchanged during execution',
      Gherkin.Do.pipe(
        Given('a configured package declaring public, beta, and internal exports')(
          'analysis',
          () => analyzeSimplePackage(),
        ),
        When('the generator pipeline runs against an existing matching report file')(
          'result',
          (s) =>
            Effect.gen(function*() {
              const router = yield* makeMessageRouter({
                cliFlags: { verbose: true },
              }).pipe(
                Effect.provideService(MessageWriter, {
                  write: () => Effect.void,
                }),
              )
              return yield* runGenerators(
                s.analysis.collector,
                s.analysis.collector.extractorConfig,
                router,
                { localBuild: false },
              )
            }),
        ),
        Then('the generation completes reporting that no review files were modified')((s) => {
          expect(s.result.apiReportChanged).toBe(false)
          expect(s.result.apiReportFilePaths.length).toBe(3)
        }),
      ),
    )
  })

import * as NodeServices from '@effect/platform-node/NodeServices'
import { ExtractionFailed, ExtractionPassed, runEffect } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

import { layer as consoleMessageWriterLayer, MessageWriter, type TextWritable } from '@systemfsoftware/api-extractor'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const fixturesUrl = new URL('__fixtures__/extractor-flow/', import.meta.url)

const resolveFixturePath = (relative: string): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = yield* path.fromFileUrl(fixturesUrl).pipe(
      Effect.orElseSucceed(() => ''),
    )
    return path.resolve(root, relative)
  })

Feature('Reviewing TypeScript package API surface definitions')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A valid package checked in silent mode emits zero console messages',
      Gherkin.Do.pipe(
        Given('a package configured for silent execution')(
          'configPath',
          () => resolveFixturePath('simple-pkg/api-extractor.json'),
        ),
        When('the extraction process reviews the API surface')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const recordedLines: string[] = []
              const writer: MessageWriter = {
                write: (level, text) =>
                  Effect.sync(() => {
                    recordedLines.push(text)
                  }),
              }
              const result = yield* runEffect(s.configPath).pipe(
                Effect.provideService(MessageWriter, writer),
              )
              return { result, recordedLines }
            }),
        ),
        Then('the extraction succeeds with clean status')((s) => {
          expect(Schema.is(ExtractionPassed)(s.outcome.result)).toBe(true)
          expect(s.outcome.result.errorCount).toBe(0)
        }),
        Then('no output messages are written to the terminal')((s) => {
          expect(s.outcome.recordedLines.length).toBe(0)
        }),
      ),
    )

    scenario(
      'An uncommitted API change checked in silent mode reports signature drift',
      Gherkin.Do.pipe(
        Given('a package whose review file does not match current declarations')(
          'configPath',
          () => resolveFixturePath('simple-pkg-drifted/api-extractor.json'),
        ),
        When('the extraction runs with chatter suppression enabled')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const recordedLines: string[] = []
              const writer: MessageWriter = {
                write: (level, text) =>
                  Effect.sync(() => {
                    recordedLines.push(text)
                  }),
              }
              const result = yield* runEffect(s.configPath, {
                cliFlags: { quiet: true },
              }).pipe(Effect.provideService(MessageWriter, writer))
              return { result, recordedLines }
            }),
        ),
        Then('the extraction outcome reports failure')((s) => {
          expect(Schema.is(ExtractionFailed)(s.outcome.result)).toBe(true)
          expect(s.outcome.result.warningCount).toBeGreaterThan(0)
        }),
        Then('the signature change warning is surfaced despite silent mode')((s) => {
          const hasDriftWarning = s.outcome.recordedLines.some(
            (line: string) => line.includes('API') || line.includes('report') || line.includes('signature'),
          )
          expect(hasDriftWarning).toBe(true)
        }),
      ),
    )

    scenario(
      'A malformed configuration file fails with a typed error',
      Gherkin.Do.pipe(
        Given('a package with an unparseable configuration file')(
          'configPath',
          () => resolveFixturePath('corrupt-config/broken.json.txt'),
        ),
        When('the extraction pipeline loads the configuration')(
          'attempt',
          (s) =>
            runEffect(s.configPath).pipe(
              Effect.provide(consoleMessageWriterLayer()),
              Effect.map(() => 'unexpected-success'),
              Effect.catch((err) => Effect.succeed(err._tag)),
            ),
        ),
        Then('a structured configuration syntax failure is produced')((s) => {
          expect(s.attempt).toBe('ConfigJsonSyntaxError')
        }),
      ),
    )

    scenario(
      'The compiler folder points at a location holding no compiler package',
      Gherkin.Do.pipe(
        Given('a package configured normally, and a compiler folder that holds no compiler package')(
          'paths',
          () =>
            Effect.gen(function*() {
              const configPath = yield* resolveFixturePath('simple-pkg/api-extractor.json')
              const compilerFolder = yield* resolveFixturePath('simple-pkg')
              return { configPath, compilerFolder }
            }),
        ),
        When('the engine is asked to review the package using that compiler folder')(
          'attempt',
          (s) => {
            const stdoutLines: string[] = []
            const stderrLines: string[] = []
            const stdout: TextWritable = {
              write: (text) => {
                stdoutLines.push(text)
              },
            }
            const stderr: TextWritable = {
              write: (text) => {
                stderrLines.push(text)
              },
            }
            return runEffect(s.paths.configPath, {
              typescriptCompilerFolder: s.paths.compilerFolder,
              cliFlags: { verbose: true },
            }).pipe(
              Effect.provide(consoleMessageWriterLayer({ stdout, stderr })),
              Effect.map(() => ({ outcome: 'review-completed', stdoutLines, stderrLines })),
              Effect.catch((err) => Effect.succeed({ outcome: err._tag, stdoutLines, stderrLines })),
            )
          },
        ),
        Then('the review is refused because the compiler could not be loaded from that folder')((s) => {
          expect(s.attempt).toMatchObject({ outcome: 'TsCompilerLoadError' })
        }),
        Then(
          'the startup notice already reached the captured standard output and the captured error stream stayed empty',
        )((s) => {
          expect(s.attempt.stdoutLines.join('')).toContain('api-extractor')
          expect(s.attempt.stderrLines).toEqual([])
        }),
      ),
    )

    scenario(
      'The configuration file does not exist at the requested path',
      Gherkin.Do.pipe(
        Given('a configuration path where no configuration file exists')(
          'configPath',
          () => resolveFixturePath('does-not-exist/api-extractor.json'),
        ),
        When('the engine is asked to review the package at that path')(
          'attempt',
          (s) =>
            runEffect(s.configPath).pipe(
              Effect.provide(consoleMessageWriterLayer()),
              Effect.map(() => 'unexpected-success'),
              Effect.catch((err) => Effect.succeed(err)),
            ),
        ),
        Then('the review is refused because the configuration file is missing')((s) => {
          expect(s.attempt).toMatchObject({ _tag: 'ConfigFileNotFound' })
        }),
        Then('the refusal names the path that was requested')((s) => {
          expect(s.attempt).toMatchObject({ filePath: s.configPath })
        }),
      ),
    )
  })

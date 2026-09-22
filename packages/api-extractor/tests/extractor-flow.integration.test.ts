import * as NodeServices from '@effect/platform-node/NodeServices'
import { runEffect } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Path from 'effect/Path'
import * as Terminal from 'effect/Terminal'
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
              const terminal = Terminal.make({
                columns: Effect.succeed(80),
                rows: Effect.succeed(24),
                readInput: Effect.die('readInput'),
                readLine: Effect.die('readLine'),
                display: (text) =>
                  Effect.sync(() => {
                    recordedLines.push(text)
                  }),
              })
              const result = yield* runEffect(s.configPath).pipe(
                Effect.provideService(Terminal.Terminal, terminal),
              )
              return { result, recordedLines }
            }),
        ),
        Then('the extraction succeeds with clean status')((s) => {
          expect(s.outcome.result.succeeded).toBe(true)
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
              const terminal = Terminal.make({
                columns: Effect.succeed(80),
                rows: Effect.succeed(24),
                readInput: Effect.die('readInput'),
                readLine: Effect.die('readLine'),
                display: (text) =>
                  Effect.sync(() => {
                    recordedLines.push(text)
                  }),
              })
              const result = yield* runEffect(s.configPath, {
                cliFlags: { quiet: true },
              }).pipe(
                Effect.provideService(Terminal.Terminal, terminal),
              )
              return { result, recordedLines }
            }),
        ),
        Then('the extraction outcome reports failure')((s) => {
          expect(s.outcome.result.succeeded).toBe(false)
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
              Effect.provideService(
                Terminal.Terminal,
                Terminal.make({
                  columns: Effect.succeed(80),
                  rows: Effect.succeed(24),
                  readInput: Effect.die('readInput'),
                  readLine: Effect.die('readLine'),
                  display: () => Effect.void,
                }),
              ),
              Effect.map(() => 'unexpected-success'),
              Effect.catch((err) => Effect.succeed(err._tag)),
            ),
        ),
        Then('a structured configuration syntax failure is produced')((s) => {
          expect(s.attempt).toBe('ConfigJsonSyntaxError')
        }),
      ),
    )
  })

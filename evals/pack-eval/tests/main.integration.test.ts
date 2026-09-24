import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { NodeHttpServer } from '@effect/platform-node'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Exit, Layer, Redacted, Stdio, Terminal } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { Command } from 'effect/unstable/cli'
import { ChildProcessSpawner } from 'effect/unstable/process'
import { expect } from 'vitest'
import { askedModel } from './__fixtures__/evaluate-pack.fixture.js'
import { OpenRouterLoopback, openRouterLoopback } from './__fixtures__/openrouter-loopback.fixture.js'

const Feature = makeFeature({ it, layer })

const ignore = (): undefined => undefined

const recordingConsoleOf = (lines: Array<string>): Console.Console => ({
  assert: ignore,
  clear: ignore,
  count: ignore,
  countReset: ignore,
  debug: ignore,
  dir: ignore,
  dirxml: ignore,
  error(...args) {
    lines.push(args.map(String).join(' '))
  },
  group: ignore,
  groupCollapsed: ignore,
  groupEnd: ignore,
  info: ignore,
  log(...args) {
    lines.push(args.map(String).join(' '))
  },
  table: ignore,
  time: ignore,
  timeEnd: ignore,
  timeLog: ignore,
  trace: ignore,
  warn: ignore,
})

const recordingLayerOf = (lines: Array<string>) =>
  Layer.mergeAll(
    Stdio.layerTest({}),
    Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.die('unused'),
        readLine: Effect.die('unused'),
        display: () => Effect.void,
      }),
    ),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die('unused')),
    ),
    Layer.succeed(Console.Console, recordingConsoleOf(lines)),
  )

const stacksOf = (lines: Array<string>, cacheDir: string, apiUrl: string) => {
  const deps = Layer.mergeAll(
    OpenRouterLanguageModel.layer({ model: askedModel }),
    PackEval.FileAnswerCache.layer({ cacheDir }),
  )
  const ports = Layer.mergeAll(
    Layer.provideMerge(PackEval.OpenRouterRuleSelector.layer({ model: askedModel }), deps),
    Layer.provideMerge(PackEval.OpenRouterTaskGenerator.layer({ model: askedModel }), deps),
  )
  return Layer.provideMerge(
    Layer.merge(ports, NodeHttpServer.layerTest),
    Layer.mergeAll(
      OpenRouterClient.layer({ apiUrl, apiKey: Redacted.make('sk-loopback') }),
      recordingLayerOf(lines),
    ),
  )
}

Feature('Booting the pack-eval command tree in process')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'Asking for help lists the five commands without running them',
      Gherkin.Do.pipe(
        Given('the pack-eval command with evaluate, fingerprint, generate, trace, and review ready to run')(
          'started',
          () => Effect.succeed(true),
        ),
        When('help is asked for on the root command')('help', (s) =>
          Effect.gen(function*() {
            const lines: Array<string> = []
            const fileSystem = yield* FileSystem.FileSystem
            const paths = yield* Path.Path
            const provider = yield* OpenRouterLoopback
            const cacheDir = paths.join(yield* fileSystem.makeTempDirectoryScoped(), 'cache')
            const asked = yield* Command.runWith(PackEval.EffectCli.cli, {
              version: PackEval.EffectCli.VERSION,
            })(['--help']).pipe(
              Effect.provide(stacksOf(lines, cacheDir, provider.apiUrl)),
              Effect.exit,
            )
            return { asked, lines, started: s.started }
          })),
        Then('help names the five commands and reaches no failure')((s) => {
          const text = s.help.lines.join('\n')
          expect(text).toContain('evaluate')
          expect(text).toContain('fingerprint')
          expect(text).toContain('generate')
          expect(text).toContain('trace')
          expect(text).toContain('review')
          expect(Exit.isSuccess(s.help.asked)).toBe(true)
        }),
      ),
    )
  })

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import type * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Runtime from 'effect/Runtime'
import { Command } from 'effect/unstable/cli'
import { expect } from 'vitest'

import { type FixtureSandbox, withFixtureProject } from './__fixtures__/extractor-harness.js'

const Feature = makeFeature({ it, layer })

const cleanPackage = 'extractor-flow/simple-pkg'

const driftedPackage = 'extractor-flow/simple-pkg-drifted'

const driftRefusal = 'You have changed the API signature for this project.'

const sinkInto = (lines: string[]): Extractor.TextWritable => ({
  write: (text) => {
    lines.push(text)
  },
})

const spokenLine = (args: ReadonlyArray<string>): string => args.join(' ')

/**
 * The console the command line renders help and CLI-level errors onto. Both render
 * through the Effect `Console` service rather than the message writer, so capturing
 * them is what makes the journeys' standard streams observable in process.
 */
const capturingConsole = (stdout: string[], stderr: string[]): Console.Console => ({
  assert: () => {},
  clear: () => {},
  count: () => {},
  countReset: () => {},
  debug: () => {},
  dir: () => {},
  dirxml: () => {},
  error: (...args: ReadonlyArray<string>) => {
    stderr.push(spokenLine(args))
  },
  group: () => {},
  groupCollapsed: () => {},
  groupEnd: () => {},
  info: () => {},
  log: (...args: ReadonlyArray<string>) => {
    stdout.push(spokenLine(args))
  },
  table: () => {},
  time: () => {},
  timeEnd: () => {},
  timeLog: () => {},
  trace: () => {},
  warn: () => {},
})

interface CliJourney {
  readonly exit: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * The exit code the published `api-extractor` bin reports for the same run. The bin
 * edge in `src/cli.ts` hands the finished fiber to `NodeRuntime.runMain`, which maps
 * it with `Runtime.defaultTeardown`: a successful exit becomes 0, an
 * interruption-only cause becomes 130, and every other cause takes the squashed
 * error's `Runtime.errorExitCode` marker — the marker `CliError.ShowHelp` sets to
 * `errors.length ? 1 : 0`, which is why an explicit help request exits 0.
 */
const exitCodeOf = <A, E>(outcome: Exit.Exit<A, E>): number => {
  let exitCode = 0
  Runtime.defaultTeardown(outcome, (observed) => {
    exitCode = observed
  })
  return exitCode
}

const runCli = (argv: ReadonlyArray<string>): Effect.Effect<CliJourney> =>
  Effect.gen(function*() {
    const stdout: string[] = []
    const stderr: string[] = []
    const outcome = yield* Command.runWith(Extractor.cli, { version: Extractor.version })(argv).pipe(
      Effect.provide(Layer.mergeAll(
        NodeServices.layer,
        Extractor.layer({ stdout: sinkInto(stdout), stderr: sinkInto(stderr) }),
        Layer.succeed(Console.Console, capturingConsole(stdout, stderr)),
      )),
      Effect.exit,
    )
    return { exit: exitCodeOf(outcome), stdout: stdout.join(''), stderr: stderr.join('') }
  })

/**
 * The published bin is launched from the package folder and finds `api-extractor.json`
 * by walking upwards from the working directory. An in-process run shares the test
 * runner's working directory, so the journey names the isolated copy's configuration
 * file explicitly — the same file the upwards walk would have found.
 */
const reviewedQuietly = (
  sandbox: FixtureSandbox,
  silences: ReadonlyArray<string>,
): Effect.Effect<CliJourney, never, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    return yield* runCli(['run', ...silences, '--config', path.join(sandbox.projectRoot, 'api-extractor.json')])
  })

Feature('Invoking the api-extractor command line over a package')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'The command line answers a help request with its usage and exits successfully',
      Gherkin.Do.pipe(
        Given('a help request handed to the tool')(
          'argv',
          () => Effect.succeed(['--help']),
        ),
        When('the tool answers the help request')(
          'journey',
          (s) => runCli(s.argv),
        ),
        Then('the answer names the tool, and the tool exits successfully')((s) => {
          expect(s.journey).toMatchObject({ exit: 0, stderr: '' })
          expect(s.journey.stdout).toContain('api-extractor')
        }),
      ),
    )

    scenario(
      'A quiet local review of a package whose committed report matches its declarations prints nothing and exits successfully',
      Gherkin.Do.pipe(
        Given('a package whose committed report matches its declarations')(
          'fixture',
          () => Effect.succeed(cleanPackage),
        ),
        When('the package is reviewed as part of a local build with the tool silenced')(
          'journey',
          (s) => withFixtureProject(s.fixture, (sandbox) => reviewedQuietly(sandbox, ['--local', '--quiet'])),
        ),
        Then('the review exits successfully having printed nothing at all')((s) => {
          expect(s.journey).toEqual({ exit: 0, stdout: '', stderr: '' })
        }),
      ),
    )

    scenario(
      'A quiet verification of a package whose committed report is out of date fails and explains the report must be refreshed',
      Gherkin.Do.pipe(
        Given('a package whose committed report describes declarations the package no longer exports')(
          'fixture',
          () => Effect.succeed(driftedPackage),
        ),
        When('the package is reviewed in verification mode with the tool silenced')(
          'journey',
          (s) => withFixtureProject(s.fixture, (sandbox) => reviewedQuietly(sandbox, ['--quiet'])),
        ),
        Then('the review fails, explains that the report is out of date, and reports the outcome on the error stream')(
          (s) => {
            expect(s.journey).toMatchObject({ exit: 1 })
            expect(s.journey.stdout).toContain(driftRefusal)
            expect(s.journey.stderr).toContain('API Extractor completed with warnings')
          },
        ),
      ),
    )
  })

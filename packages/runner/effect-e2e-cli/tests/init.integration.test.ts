import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import {
  ARROW_DOWN,
  declaredRanges,
  filesUnder,
  manifestAt,
  npmCallsIn,
  readText,
  recordingNpm,
  runBin,
  stateUnder,
  tempRoot,
  writeText,
} from './__fixtures__/cli.fixture.js'

const Feature = makeFeature({ it })

const SUITE_FILES = [
  '.gitignore',
  'e2e.config.ts',
  'global-setup.ts',
  'package.json',
  'runner.ts',
  'tests/example-agent.e2e.ts',
  'tests/example.e2e.ts',
  'vitest.config.ts',
]

const REPLACED_FILES = SUITE_FILES.filter((file) => file !== 'package.json' && file !== '.gitignore')

const SUITE_DEPENDENCIES = [
  '@effect/platform-node',
  '@systemfsoftware/effect-e2e',
  '@systemfsoftware/effect-e2e-web',
  '@systemfsoftware/vitest-config',
  'effect',
  'playwright',
  'vitest',
]

const FLAGS = ['--engine', 'web', '--gateway', 'openrouter', '--no-install']

const MARKER = '// written by hand before init\n'

const initIn = (cwd: string, ...args: ReadonlyArray<string>) => runBin({ cwd, args: ['init', ...args] })

Feature('Scaffolding a suite with effect-e2e init')
  .withLayer(Layer.empty)
  .live('each scenario runs the built bin as a child process in a fresh OS temporary directory')
  .body(({ scenario }) => {
    scenario(
      'In an empty directory, init writes every suite file and the dependencies this release declares',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given("the ranges in the CLI's own package.json")('ranges', () => declaredRanges),
        When('init runs with --dir suite and every choice given as a flag')('after', ({ root }) =>
          Effect.all({
            run: initIn(root, '--dir', 'suite', ...FLAGS),
            files: filesUnder(`${root}/suite`),
            manifest: manifestAt(`${root}/suite/package.json`),
          })),
        Then('it exits 0, writes the eight files, and pins each dependency at the declared range')((s, expect) =>
          expect({
            exitCode: s.after.run.exitCode,
            files: s.after.files,
            script: s.after.manifest.scripts['test:e2e'],
            devDependencies: s.after.manifest.devDependencies,
          }).toEqual({
            exitCode: 0,
            files: SUITE_FILES,
            script: 'vitest run',
            devDependencies: Object.fromEntries(SUITE_DEPENDENCIES.map((name) => [name, s.ranges[name]])),
          })
        ),
      ),
    )

    scenario(
      'A second init over a written suite exits 2, names every existing file, and changes nothing',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given('a suite init already wrote')('first', ({ root }) => initIn(root, '--dir', 'suite', ...FLAGS)),
        Given('every file in it, with its content and modification time')(
          'before',
          ({ root }) => stateUnder(`${root}/suite`),
        ),
        When('init runs again without --force')(
          'after',
          ({ root }) =>
            Effect.all({ run: initIn(root, '--dir', 'suite', ...FLAGS), state: stateUnder(`${root}/suite`) }),
        ),
        Then('it exits 2, its output names each file it would replace, and no file differs')((s, expect) =>
          expect({
            exitCode: s.after.run.exitCode,
            unnamed: REPLACED_FILES.filter((file) => !s.after.run.output.includes(`${s.root}/suite/${file}`)),
            state: s.after.state,
          }).toEqual({ exitCode: 2, unnamed: [], state: s.before })
        ),
      ),
    )

    scenario(
      'One existing file refuses the whole scaffold: init exits 2 naming it and creates nothing else',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given('a hand-written suite/e2e.config.ts')(
          'planted',
          ({ root }) => writeText({ file: `${root}/suite/e2e.config.ts`, content: MARKER }),
        ),
        When('init runs without --force')('after', ({ root }) =>
          Effect.all({
            run: initIn(root, '--dir', 'suite', ...FLAGS),
            files: filesUnder(`${root}/suite`),
            config: readText(`${root}/suite/e2e.config.ts`),
          })),
        Then('it exits 2 naming that path, and the planted file is the only file and is untouched')((s, expect) =>
          expect({
            exitCode: s.after.run.exitCode,
            named: s.after.run.output.includes(`${s.root}/suite/e2e.config.ts`),
            files: s.after.files,
            config: s.after.config,
          }).toEqual({ exitCode: 2, named: true, files: ['e2e.config.ts'], config: MARKER })
        ),
      ),
    )

    scenario(
      '--force replaces the existing files and keeps the package.json entries init does not own',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given('a hand-written suite/e2e.config.ts')(
          'planted',
          ({ root }) => writeText({ file: `${root}/suite/e2e.config.ts`, content: MARKER }),
        ),
        Given('a suite package.json with its own script and dependency range')('manifest', ({ root }) =>
          writeText({
            file: `${root}/suite/package.json`,
            content: JSON.stringify({ scripts: { lint: 'oxlint .' }, devDependencies: { effect: '4.0.0' } }),
          })),
        When('init runs with --force')('after', ({ root }) =>
          Effect.all({
            run: initIn(root, '--dir', 'suite', ...FLAGS, '--force'),
            config: readText(`${root}/suite/e2e.config.ts`),
            manifest: manifestAt(`${root}/suite/package.json`),
          })),
        Then("it exits 0, the config is init's, and the suite's own script and range survive")((s, expect) =>
          expect({
            exitCode: s.after.run.exitCode,
            replaced: s.after.config !== MARKER && s.after.config.includes('defineConfig('),
            lint: s.after.manifest.scripts['lint'],
            testE2e: s.after.manifest.scripts['test:e2e'],
            effect: s.after.manifest.devDependencies['effect'],
          }).toEqual({ exitCode: 0, replaced: true, lint: 'oxlint .', testE2e: 'vitest run', effect: '4.0.0' })
        ),
      ),
    )

    scenario(
      'Without --dir, init scaffolds the nearest package root above the working directory',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given('a package whose root holds package.json and a nested src/deep directory')(
          'package',
          ({ root }) =>
            Effect.andThen(
              writeText({ file: `${root}/app/package.json`, content: JSON.stringify({ name: 'app' }) }),
              writeText({ file: `${root}/app/src/deep/.keep`, content: '' }),
            ),
        ),
        When('init runs from src/deep with no --dir')(
          'after',
          ({ root }) => Effect.all({ run: initIn(`${root}/app/src/deep`, ...FLAGS), files: filesUnder(`${root}/app`) }),
        ),
        Then('it exits 0 and every suite file lands at the package root')((s, expect) =>
          expect({
            exitCode: s.after.run.exitCode,
            missing: SUITE_FILES.filter((file) => !s.after.files.includes(file)),
          }).toEqual({ exitCode: 0, missing: [] })
        ),
      ),
    )

    scenario(
      'Without --gateway, init asks for it, and the chosen gateway is the one the config calls',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        When('init runs without --gateway and the answer moves to the second choice')(
          'after',
          ({ root }) =>
            Effect.all({
              run: runBin({
                cwd: root,
                args: ['init', '--dir', 'suite', '--engine', 'web', '--no-install'],
                input: `${ARROW_DOWN}\r`,
              }),
              config: readText(`${root}/suite/e2e.config.ts`),
            }),
        ),
        Then('it asked for the gateway, exits 0, and the config calls the openai-compatible gateway')((s, expect) =>
          expect({
            exitCode: s.after.run.exitCode,
            asked: s.after.run.output.includes('Model gateway'),
            gateway: s.after.config.includes("gateway: 'openai-compatible'"),
          }).toEqual({ exitCode: 0, asked: true, gateway: true })
        ),
      ),
    )

    scenario(
      'An unknown --gateway value exits non-zero and writes nothing',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        When('init runs with --gateway carrier-pigeon')('after', ({ root }) =>
          Effect.all({
            run: initIn(root, '--dir', 'suite', '--engine', 'web', '--gateway', 'carrier-pigeon', '--no-install'),
            files: filesUnder(root),
          })),
        Then('the exit code is not 0 and no file exists')((s, expect) =>
          expect({ failed: s.after.run.exitCode !== 0, files: s.after.files }).toEqual({ failed: true, files: [] })
        ),
      ),
    )

    scenario(
      "Without --no-install, init runs the package manager's install once in the suite root",
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given('a recording npm first on PATH')('npm', ({ root }) => recordingNpm(`${root}/bin`)),
        When('init runs with every choice but --no-install')('after', ({ root }) =>
          Effect.all({
            run: runBin({
              cwd: root,
              args: ['init', '--dir', 'suite', '--engine', 'web', '--gateway', 'openrouter'],
              pathPrefix: `${root}/bin`,
            }),
            calls: npmCallsIn(`${root}/bin`),
          })),
        Then('it exits 0 and npm ran install once, in the suite root')((s, expect) =>
          expect({ exitCode: s.after.run.exitCode, calls: s.after.calls }).toEqual({
            exitCode: 0,
            calls: [{ argv: ['install'], cwd: `${s.root}/suite` }],
          })
        ),
      ),
    )

    scenario(
      'With --no-install, init never runs the package manager',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('an empty temporary directory')('root', () => tempRoot),
        Given('a recording npm first on PATH')('npm', ({ root }) => recordingNpm(`${root}/bin`)),
        When('init runs with --no-install')('after', ({ root }) =>
          Effect.all({
            run: runBin({ cwd: root, args: ['init', '--dir', 'suite', ...FLAGS], pathPrefix: `${root}/bin` }),
            calls: npmCallsIn(`${root}/bin`),
          })),
        Then('it exits 0 and npm recorded no call')((s, expect) =>
          expect({ exitCode: s.after.run.exitCode, calls: s.after.calls }).toEqual({ exitCode: 0, calls: [] })
        ),
      ),
    )
  })

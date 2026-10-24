import { NodeChildProcessSpawner, NodeFileSystem } from '@effect/platform-node-shared'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Path } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'

const Feature = makeFeature({ it })

const bin = new URL('../../bin/package-layers.ts', import.meta.url).pathname
const fixtures = new URL('../__fixtures__', import.meta.url).pathname

const ROWS = [
  { outcome: 'a passing tree', args: ['check', '--root', `${fixtures}/layered-tree`], status: 0 },
  { outcome: 'a refused tree', args: ['check', '--root', `${fixtures}/forbidden-edge`], status: 1 },
  { outcome: 'an unreadable package.json', args: ['check', '--root', `${fixtures}/manifest-refused`], status: 1 },
  { outcome: 'an unknown check flag', args: ['check', '--nope'], status: 2 },
  { outcome: 'a --root that is not a directory', args: ['check', '--root', `${fixtures}/no-such-tree`], status: 2 },
  { outcome: 'a printed map', args: ['list', '--root', `${fixtures}/layered-tree`], status: 0 },
  { outcome: 'a printed JSON map', args: ['list', '--json', '--root', `${fixtures}/layered-tree`], status: 0 },
  { outcome: 'an undecodable map', args: ['list', '--root', `${fixtures}/map-refused`], status: 1 },
  { outcome: 'an unknown list flag', args: ['list', '--bogus'], status: 2 },
  { outcome: 'an unknown subcommand', args: ['frob'], status: 2 },
] as const

const runBin = (args: readonly string[]) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return Number(yield* spawner.exitCode(ChildProcess.make('bun', [bin, ...args])))
  })

Feature('Reporting the outcome through the exit status')
  .live('bun running bin/package-layers.ts as a child process')
  .withScenarioLayer(
    NodeChildProcessSpawner.layer.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, Path.layer))),
  )
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Running the bin on <outcome> exits with its documented status',
      ROWS,
      (row) =>
        Gherkin.Do.pipe(
          Given('the arguments a caller passes to the bin')('args', () => Effect.succeed(row.args)),
          When('bun runs bin/package-layers.ts with them')('status', ({ args }) => runBin(args)),
          Then('the process exits with the status the help text documents')((state, expect) =>
            expect(state.status).toEqual(row.status)
          ),
        ),
    )
  })

import { NodeHttpClient, NodeServices } from '@effect/platform-node'
import { defineConfig } from '@systemfsoftware/effect-e2e'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import { buildReport, renderJson, Report1, RunId } from '@systemfsoftware/effect-e2e/report'
import type { AttemptEntry } from '@systemfsoftware/effect-e2e/run'
import { type E2EGlobalSetupProject, makeGlobalSetup, type RunnerOptions } from '@systemfsoftware/effect-e2e/runner'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

import { GREET_SITE } from './__fixtures__/agent-sites.fixture.js'
import { asserting, greets, GREETS_ANSWERS, helloContains, NOT_GOODBYE } from './__fixtures__/report-runs.fixture.js'
import { type World, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const PROJECT = 'global-setup'
const OUTPUT = '.e2e'
const STARTED = DateTime.makeUnsafe('2026-10-24T09:00:00.000Z')
const FINISHED = DateTime.makeUnsafe('2026-10-24T09:05:00.000Z')

const CONFIG = defineConfig({
  targets: [{
    name: 'web',
    engine: { _tag: 'WebEngine', adapter: '@systemfsoftware/effect-e2e-web', browser: 'chromium' },
    app: { url: GREET_SITE.origin, identity: 'greet-app' },
  }],
})

const REFUSED = defineConfig({ ...CONFIG, projectId: '' })

const OPTIONS: RunnerOptions = {
  platform: Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerUndici),
  engines: {
    '@systemfsoftware/effect-e2e-web': {
      identity: { adapter: 'memory', kind: 'web' },
      version: '0.0.0-test',
      layer: Engine.layerTest(GREET_SITE),
    },
  },
  env: {},
  defaults: { ci: false, projectId: PROJECT, cores: 1 },
  version: '0.0.0-test',
}

/** Vitest's side of a global setup: the suite root it runs in, and every value it hands the workers. */
interface VitestHost {
  readonly project: E2EGlobalSetupProject
  readonly provided: ReadonlyArray<string>
}

const vitestHostAt = (root: string): VitestHost => {
  const provided: Array<string> = []
  return {
    project: {
      config: { root },
      provide: (_key, value) => {
        provided.push(typeof value === 'string' ? value : '')
      },
    },
    provided,
  }
}

const entriesOf = (world: World): Effect.Effect<ReadonlyArray<AttemptEntry>> => world.log.entries

const greetsPassed = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: GREETS_ANSWERS })
  yield* greets(world)
  return yield* entriesOf(world)
})

const savesFailed = Effect.gen(function*() {
  const world = yield* worldOf({ mode: 'read-write', answers: [helloContains('Goodbye'), NOT_GOODBYE] })
  yield* asserting({ world, retry: 0, statement: 'the greeting says goodbye' })
  return yield* entriesOf(world)
})

const inOutput = (root: string, file: string) => Effect.map(Path.Path, (path) => path.join(root, OUTPUT, file))

const fileWritten = (root: string, file: string, text: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = yield* inOutput(root, file)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true })
    yield* fs.writeFileString(target, text)
  })

const CONFIG_PROJECT = Report1.fields.run.fields.project.make(PROJECT)

/** A worker's partial as the runner writes it: a `report-1` document of its attempts, stamped with a run id. */
const partialWritten = (root: string, worker: string, runId: string, entries: ReadonlyArray<AttemptEntry>) =>
  Effect.flatMap(
    renderJson(
      buildReport({
        run: { id: RunId.make(runId), project: CONFIG_PROJECT, startedAt: STARTED, finishedAt: FINISHED, errors: [] },
        entries,
      }),
    ),
    (text) => fileWritten(root, `partials/${worker}.json`, text),
  )

const present = (root: string, file: string) =>
  Effect.flatMap(inOutput(root, file), (target) => Effect.flatMap(FileSystem.FileSystem, (fs) => fs.exists(target)))

const partialFilesOf = (root: string) =>
  Effect.flatMap(
    inOutput(root, 'partials'),
    (directory) => Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readDirectory(directory)),
  )

const mergedReportOf = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const report = yield* Schema.decodeEffect(Schema.fromJsonString(Report1))(
      yield* fs.readFileString(yield* inOutput(root, 'report.json')),
    )
    return {
      runId: report.run.id,
      run: [report.run.status, report.run.exitCode],
      results: report.results.map((result) => [result.title, result.status]),
    }
  })

const freshRoot = Effect.flatMap(
  FileSystem.FileSystem,
  (fs) => fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-global-setup-' }),
)

const setUp = (config: typeof CONFIG, host: VitestHost) =>
  Effect.promise(() => makeGlobalSetup(config, OPTIONS)(host.project))

Feature("Merging the report partials a run's workers wrote into one run report")
  .withLayer(Layer.empty)
  .live('the global setup clears, provides and merges real files under a temporary suite root')
  .body(({ scenario }) => {
    scenario(
      'Two workers of one run leave one report with both results, and the previous run leaves nothing behind',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite whose previous run left a partial, a report, and a cache entry')(
          'root',
          () =>
            Effect.gen(function*() {
              const root = yield* freshRoot
              yield* partialWritten(root, 'previous-worker', `${PROJECT}-previous`, yield* greetsPassed)
              yield* fileWritten(root, 'report.json', '{}')
              yield* fileWritten(root, 'cache/entry.json', '{}')
              return root
            }),
        ),
        When('the run sets up, one worker passes greets and another fails saves, and the run tears down')(
          'run',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUp(CONFIG, host)
              const runId = host.provided[0] ?? ''
              yield* partialWritten(root, 'worker-a', runId, yield* greetsPassed)
              yield* partialWritten(root, 'worker-b', runId, yield* savesFailed)
              yield* Effect.promise(teardown)
              return {
                provided: host.provided.length,
                runIdNamesProject: runId.startsWith(`${PROJECT}-`),
                partials: (yield* partialFilesOf(root)).toSorted(),
                cacheKept: yield* present(root, 'cache/entry.json'),
                report: yield* mergedReportOf(root),
                runId,
              }
            }),
        ),
        Then(
          'report.json holds greets passed and saves failed once each under the provided run id, and the run failed',
        )(
          (s, expect) =>
            expect({ ...s.run, report: { ...s.run.report, runId: s.run.report.runId === s.run.runId } }).toEqual({
              provided: 1,
              runIdNamesProject: true,
              partials: ['worker-a.json', 'worker-b.json'],
              cacheKept: true,
              report: { runId: true, run: ['failed', 1], results: [['greets', 'passed'], ['saves', 'failed']] },
              runId: s.run.runId,
            }),
        ),
      ),
    )

    scenario(
      'A partial stamped with another run id fails the teardown, and no report is written',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('one worker writes under the provided run id and another under a different one, and the run tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUp(CONFIG, host)
              yield* partialWritten(root, 'worker-a', host.provided[0] ?? '', yield* greetsPassed)
              yield* partialWritten(root, 'worker-b', `${PROJECT}-another`, yield* savesFailed)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return { failed: Exit.isFailure(torn), report: yield* present(root, 'report.json') }
            }),
        ),
        Then('the teardown fails and report.json does not exist')((s, expect) =>
          expect(s.outcome).toEqual({ failed: true, report: false })
        ),
      ),
    )

    scenario(
      'A run in which no worker wrote a partial tears down without a report',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('the run sets up and tears down with no partial written')('outcome', ({ root }) =>
          Effect.gen(function*() {
            const teardown = yield* setUp(CONFIG, vitestHostAt(root))
            const torn = yield* Effect.exit(Effect.tryPromise(teardown))
            return { failed: Exit.isFailure(torn), report: yield* present(root, 'report.json') }
          })),
        Then('the teardown succeeds and report.json does not exist')((s, expect) =>
          expect(s.outcome).toEqual({ failed: false, report: false })
        ),
      ),
    )

    scenario(
      'A config the core refuses provides no run id',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('a run whose config has an empty project id sets up and tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUp(REFUSED, host)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return { provided: host.provided.length, failed: Exit.isFailure(torn) }
            }),
        ),
        Then('nothing is provided and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual({ provided: 0, failed: false })
        ),
      ),
    )
  })

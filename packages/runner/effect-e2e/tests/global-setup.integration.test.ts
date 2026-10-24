import { NodeHttpClient, NodeServices } from '@effect/platform-node'
import { defineConfig } from '@systemfsoftware/effect-e2e'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import { buildReport, renderJson, Report1, RunId } from '@systemfsoftware/effect-e2e/report'
import type { AttemptEntry } from '@systemfsoftware/effect-e2e/run'
import {
  type E2EGlobalSetupProject,
  makeGlobalSetup,
  RUN_OUTPUT_KEY,
  RUN_REFUSAL_KEY,
  type RunnerOptions,
} from '@systemfsoftware/effect-e2e/runner'
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
const RUN_ID_PATTERN = /^global-setup-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u
const RUN_ID_KEY = '@systemfsoftware/effect-e2e:run-id'

const CONFIG = defineConfig({
  targets: [{
    name: 'web',
    engine: { _tag: 'WebEngine', adapter: '@systemfsoftware/effect-e2e-web', browser: 'chromium' },
    app: { url: GREET_SITE.origin, identity: 'greet-app' },
  }],
})

const REFUSED = defineConfig({ ...CONFIG, projectId: '' })

const AI_TRACE_ON = defineConfig({ ...CONFIG, aiTrace: true })

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

interface VitestHost {
  readonly project: E2EGlobalSetupProject
  readonly provided: Readonly<Record<string, string>>
}

const vitestHostAt = (root: string): VitestHost => {
  const provided: Record<string, string> = {}
  return {
    project: {
      config: { root },
      provide: (key, value) => {
        provided[key] = typeof value === 'string' ? value : ''
      },
    },
    provided,
  }
}

const refusalOf = (host: VitestHost, keyPath: string, failed: boolean) => ({
  provided: Object.keys(host.provided),
  namesKeyPath: host.provided[RUN_REFUSAL_KEY]?.startsWith(`config ${keyPath}:`) === true,
  failed,
})

const REFUSED_OUTCOME = { provided: [RUN_REFUSAL_KEY], namesKeyPath: true, failed: false }

const STALE_TITLE_DIRECTORY = 'checks-the-title-1a2b3c4d'
const STALE_PROFILE_DIRECTORY = 'saves-the-profile-0a1b2c3d'
const STALE_AI_TRACE = '{"schema":"ai-trace-1"}'
const TRACE_PAGE = '# trace page\n\n- screen.txt\n'
const TRACE_PAGE_BYTES = Array.from(new TextEncoder().encode(TRACE_PAGE))

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

const inDirectory = (root: string, directory: string, file: string) =>
  Effect.map(Path.Path, (path) => path.join(root, directory, file))

const inOutput = (root: string, file: string) => inDirectory(root, OUTPUT, file)

const fileWrittenIn = (directory: string) => (root: string, file: string, text: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = yield* inDirectory(root, directory, file)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true })
    yield* fs.writeFileString(target, text)
  })

const fileWritten = fileWrittenIn(OUTPUT)

const CONFIG_PROJECT = Report1.fields.run.fields.project.make(PROJECT)

const partialWrittenIn =
  (directory: string) => (root: string, worker: string, runId: string, entries: ReadonlyArray<AttemptEntry>) =>
    Effect.flatMap(
      renderJson(
        buildReport({
          run: { id: RunId.make(runId), project: CONFIG_PROJECT, startedAt: STARTED, finishedAt: FINISHED, errors: [] },
          entries,
        }),
      ),
      (text) => fileWrittenIn(directory)(root, `partials/${worker}.json`, text),
    )

const partialWritten = partialWrittenIn(OUTPUT)

const presentIn = (directory: string) => (root: string, file: string) =>
  Effect.flatMap(
    inDirectory(root, directory, file),
    (target) => Effect.flatMap(FileSystem.FileSystem, (fs) => fs.exists(target)),
  )

const present = presentIn(OUTPUT)

const bytesIn = (directory: string) => (root: string, file: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return Array.from(yield* fs.readFile(yield* inDirectory(root, directory, file)))
  })

const staleRunLeftIn = (root: string) =>
  Effect.gen(function*() {
    yield* fileWritten(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`, STALE_AI_TRACE)
    yield* fileWritten(root, `results/${STALE_TITLE_DIRECTORY}/trace.md`, TRACE_PAGE)
    yield* fileWritten(root, `results/${STALE_PROFILE_DIRECTORY}/ai-trace.json`, STALE_AI_TRACE)
  })

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

const setUpWith = (env: Record<string, string>) => (config: typeof CONFIG, host: VitestHost) =>
  Effect.promise(() => makeGlobalSetup(config, { ...OPTIONS, env })(host.project))

Feature("Setting up a run's shared files and merging the partials its workers wrote")
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
              const runId = host.provided[RUN_ID_KEY] ?? ''
              yield* partialWritten(root, 'worker-a', runId, yield* greetsPassed)
              yield* partialWritten(root, 'worker-b', runId, yield* savesFailed)
              yield* Effect.promise(teardown)
              const report = yield* mergedReportOf(root)
              return {
                output: host.provided[RUN_OUTPUT_KEY],
                runIdNamesProject: RUN_ID_PATTERN.test(runId),
                partials: (yield* partialFilesOf(root)).toSorted(),
                cacheKept: yield* present(root, 'cache/entry.json'),
                report: { ...report, runId: report.runId === runId },
              }
            }),
        ),
        Then(
          'report.json holds greets passed and saves failed once each under the provided run id and output, and the run failed',
        )(
          (s, expect) =>
            expect(s.run).toEqual({
              output: OUTPUT,
              runIdNamesProject: true,
              partials: ['worker-a.json', 'worker-b.json'],
              cacheKept: true,
              report: { runId: true, run: ['failed', 1], results: [['greets', 'passed'], ['saves', 'failed']] },
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
              yield* partialWritten(root, 'worker-a', host.provided[RUN_ID_KEY] ?? '', yield* greetsPassed)
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
      'A config the core refuses provides its refusal and no run id',
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
              return refusalOf(host, 'projectId', Exit.isFailure(torn))
            }),
        ),
        Then('only the refusal naming the project id is provided, and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual(REFUSED_OUTCOME)
        ),
      ),
    )

    scenario(
      'A run whose environment moves the output directory merges there and leaves the old report untouched',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite whose previous run left a report at the default location')('root', () =>
          Effect.gen(function*() {
            const root = yield* freshRoot
            yield* fileWritten(root, 'report.json', '{}')
            return root
          })),
        When(
          'a run whose environment overrides the output directory sets up, one worker passes greets, and it tears down',
        )(
          'run',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUpWith({ E2E_OUTPUT: 'evidence' })(CONFIG, host)
              yield* partialWrittenIn('evidence')(
                root,
                'worker-a',
                host.provided[RUN_ID_KEY] ?? '',
                yield* greetsPassed,
              )
              yield* Effect.promise(teardown)
              return {
                output: host.provided[RUN_OUTPUT_KEY],
                overridden: yield* presentIn('evidence')(root, 'report.json'),
                oldReport: yield* present(root, 'report.json'),
              }
            }),
        ),
        Then('the overridden directory is provided, the merged report lives there and the old report still exists')(
          (s, expect) => expect(s.run).toEqual({ output: 'evidence', overridden: true, oldReport: true }),
        ),
      ),
    )

    scenario(
      'A run whose environment names the target the suite carries sets up as usual',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('a run whose environment overrides the target to the suite web target sets up and tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUpWith({ E2E_TARGET: 'web' })(CONFIG, host)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return { provided: Object.keys(host.provided).toSorted(), failed: Exit.isFailure(torn) }
            }),
        ),
        Then('the run id and the output directory are provided and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual({ provided: [RUN_ID_KEY, RUN_OUTPUT_KEY].toSorted(), failed: false })
        ),
      ),
    )

    scenario(
      'A run whose environment names a target the suite does not carry provides its refusal and no run id',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('a run whose environment overrides the target to one the config does not name sets up and tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUpWith({ E2E_TARGET: 'ghost' })(CONFIG, host)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return refusalOf(host, 'targets', Exit.isFailure(torn))
            }),
        ),
        Then('only the refusal naming the targets is provided, and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual(REFUSED_OUTCOME)
        ),
      ),
    )

    scenario(
      'A run whose environment names an agent the suite does not carry provides its refusal and no run id',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('a run whose environment overrides the agent to one the config does not name sets up and tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUpWith({ E2E_AGENT: 'ghost' })(CONFIG, host)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return refusalOf(host, 'agents.ghost', Exit.isFailure(torn))
            }),
        ),
        Then('only the refusal naming the agent is provided, and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual(REFUSED_OUTCOME)
        ),
      ),
    )

    scenario(
      'A run whose environment overrides the timeout with a value that is not a number provides its refusal and no run id',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('a run whose environment overrides the timeout to a non-number sets up and tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUpWith({ E2E_TIMEOUT: 'soon' })(CONFIG, host)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return refusalOf(host, 'timeout', Exit.isFailure(torn))
            }),
        ),
        Then('only the refusal naming the timeout is provided, and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual(REFUSED_OUTCOME)
        ),
      ),
    )

    scenario(
      'A run whose environment overrides the cache mode to a value outside its choices provides its refusal and no run id',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('a run whose environment overrides the cache mode to a value it does not offer sets up and tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUpWith({ E2E_CACHE: 'sometimes' })(CONFIG, host)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return refusalOf(host, 'cache.mode', Exit.isFailure(torn))
            }),
        ),
        Then('only the refusal naming the cache mode is provided, and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual(REFUSED_OUTCOME)
        ),
      ),
    )

    scenario(
      'A run whose environment overrides ai-trace with a value outside its choices provides its refusal and no run id',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite root')('root', () => freshRoot),
        When('a run whose environment sets the ai-trace override to a value it does not offer sets up and tears down')(
          'outcome',
          ({ root }) =>
            Effect.gen(function*() {
              const host = vitestHostAt(root)
              const teardown = yield* setUpWith({ E2E_AI_TRACE: 'yes' })(CONFIG, host)
              const torn = yield* Effect.exit(Effect.tryPromise(teardown))
              return refusalOf(host, 'aiTrace', Exit.isFailure(torn))
            }),
        ),
        Then('only the refusal naming ai-trace is provided, and the teardown succeeds')((s, expect) =>
          expect(s.outcome).toEqual(REFUSED_OUTCOME)
        ),
      ),
    )

    scenario(
      'A run without ai-trace removes the ai-trace files a previous run left and keeps the other results',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite whose previous run left two ai-trace files beside a trace page')(
          'root',
          () =>
            Effect.gen(function*() {
              const root = yield* freshRoot
              yield* staleRunLeftIn(root)
              return root
            }),
        ),
        When('the run sets up without the ai-trace override')('cleared', ({ root }) =>
          Effect.gen(function*() {
            yield* setUp(CONFIG, vitestHostAt(root))
            return {
              titleAiTrace: yield* present(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`),
              profileAiTrace: yield* present(root, `results/${STALE_PROFILE_DIRECTORY}/ai-trace.json`),
              tracePage: yield* bytesIn(OUTPUT)(root, `results/${STALE_TITLE_DIRECTORY}/trace.md`),
            }
          })),
        Then('both ai-trace files are gone and the trace page is byte-identical')((s, expect) =>
          expect(s.cleared).toEqual({ titleAiTrace: false, profileAiTrace: false, tracePage: TRACE_PAGE_BYTES })
        ),
      ),
    )

    scenario(
      'A run without ai-trace sets up when a file that is not a result directory sits among the results',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite whose previous run left an ai-trace file and a stray file beside the result directories')(
          'root',
          () =>
            Effect.gen(function*() {
              const root = yield* freshRoot
              yield* staleRunLeftIn(root)
              yield* fileWritten(root, 'results/.DS_Store', 'finder metadata')
              return root
            }),
        ),
        When('the run sets up without the ai-trace override')('state', ({ root }) =>
          Effect.gen(function*() {
            const host = vitestHostAt(root)
            const started = yield* Effect.exit(setUp(CONFIG, host))
            return {
              started: Exit.isSuccess(started),
              runIdProvided: RUN_ID_KEY in host.provided,
              staleAiTrace: yield* present(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`),
              strayFile: yield* present(root, 'results/.DS_Store'),
            }
          })),
        Then('the run starts, the stale ai-trace file is gone and the stray file is untouched')((s, expect) =>
          expect(s.state).toEqual({ started: true, runIdProvided: true, staleAiTrace: false, strayFile: true })
        ),
      ),
    )

    scenario(
      'A run with ai-trace on leaves the files a previous run wrote in place',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite whose previous run left two ai-trace files beside a trace page')(
          'root',
          () =>
            Effect.gen(function*() {
              const root = yield* freshRoot
              yield* staleRunLeftIn(root)
              return root
            }),
        ),
        When('the run sets up with the ai-trace override on')('kept', ({ root }) =>
          Effect.gen(function*() {
            yield* setUpWith({ E2E_AI_TRACE: 'true' })(CONFIG, vitestHostAt(root))
            return {
              titleAiTrace: yield* present(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`),
              profileAiTrace: yield* present(root, `results/${STALE_PROFILE_DIRECTORY}/ai-trace.json`),
              tracePage: yield* present(root, `results/${STALE_TITLE_DIRECTORY}/trace.md`),
            }
          })),
        Then('every file the previous run left is still there')((s, expect) =>
          expect(s.kept).toEqual({ titleAiTrace: true, profileAiTrace: true, tracePage: true })
        ),
      ),
    )

    scenario(
      'An ai-trace override of false turns a config that asks for ai-trace off and clears the stale file',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite whose config turns ai-trace on and whose previous run left an ai-trace file')(
          'root',
          () =>
            Effect.gen(function*() {
              const root = yield* freshRoot
              yield* fileWritten(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`, STALE_AI_TRACE)
              return root
            }),
        ),
        When('the run sets up with the ai-trace override off')('state', ({ root }) =>
          Effect.gen(function*() {
            const host = vitestHostAt(root)
            yield* setUpWith({ E2E_AI_TRACE: 'false' })(AI_TRACE_ON, host)
            return {
              runIdProvided: RUN_ID_KEY in host.provided,
              staleAiTrace: yield* present(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`),
            }
          })),
        Then('the run starts and the stale ai-trace file is gone')((s, expect) =>
          expect(s.state).toEqual({ runIdProvided: true, staleAiTrace: false })
        ),
      ),
    )

    scenario(
      'A blank ai-trace override leaves a config that asks for ai-trace on',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a suite whose config turns ai-trace on and whose previous run left an ai-trace file')(
          'root',
          () =>
            Effect.gen(function*() {
              const root = yield* freshRoot
              yield* fileWritten(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`, STALE_AI_TRACE)
              return root
            }),
        ),
        When('the run sets up with a blank ai-trace override')('state', ({ root }) =>
          Effect.gen(function*() {
            const host = vitestHostAt(root)
            yield* setUpWith({ E2E_AI_TRACE: '' })(AI_TRACE_ON, host)
            return {
              runIdProvided: RUN_ID_KEY in host.provided,
              staleAiTrace: yield* present(root, `results/${STALE_TITLE_DIRECTORY}/ai-trace.json`),
            }
          })),
        Then('the run starts and the stale ai-trace file is still there')((s, expect) =>
          expect(s.state).toEqual({ runIdProvided: true, staleAiTrace: true })
        ),
      ),
    )
  })

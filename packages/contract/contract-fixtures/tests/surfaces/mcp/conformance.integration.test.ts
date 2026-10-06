/// <reference types="vite/client" />
import { loadRequirements, scenariosToRun } from '#mcp-conformance/requirements.js'
import { runServerConformanceTest, type ServerRun } from '#mcp-conformance/runner/index.js'
import { getClientScenario, listClientScenarios } from '#mcp-conformance/scenarios/index.js'
import { SKILLS_EXTENSION_ID } from '#mcp-conformance/scenarios/server/skills/helpers.js'
import { DRAFT_PROTOCOL_VERSION } from '#mcp-conformance/types.js'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { bundleWith, Harness, layer } from '@systemfsoftware/effect-workerd-harness'
import { VitestTestContext } from '@systemfsoftware/vitest'
import { Effect, Layer, Option, Schema } from 'effect'
import { parse } from 'yaml'
import upstreamManifestText from '../../../upstream-tests.json?raw'
import baselineText from './__fixtures__/conformance-baseline.yml?raw'
import { freeLoopbackOrigin } from './__fixtures__/loopback-port.fixture.js'
import { setDispatcher } from './__fixtures__/undici.fixture.js'
import { decodeInPlace, fileDefining, type ScenarioModule } from './__fixtures__/upstream-manifest.fixture.js'

declare module 'vitest' {
  interface TaskMeta {
    /** The in-place file of `repos/mcp-conformance` this test executes; the upstream guard reads it from the run's JSON report. */
    upstreamFile?: string
  }
}

const Feature = makeFeature({ it })

const vendoredSource = new URL('../../../../../../repos/mcp-conformance/src', import.meta.url).pathname

const worker = await Effect.runPromise(
  Effect.orDie(
    bundleWith({
      entry: new URL('./__fixtures__/mcp-conformance.worker.ts', import.meta.url).pathname,
      alias: { '#mcp-conformance': vendoredSource },
    }),
  ),
)

const origin = await Effect.runPromise(freeLoopbackOrigin)
const loopback = new URL(origin)

const harnessLayer = layer({
  worker,
  durableObjects: [{ className: 'McpSession', storage: 'sqlite' }],
  bindings: [
    { _tag: 'DurableObject', name: 'MCP_SESSION', className: 'McpSession' },
    { _tag: 'PlainText', name: 'MCP_ORIGIN', value: origin },
    { _tag: 'PlainText', name: 'MCP_RESOURCE_URL', value: `${origin}/mcp` },
  ],
  host: loopback.hostname,
  port: Number(loopback.port),
})

const revisions: ReadonlyArray<string> = ['2026-07-28', '2025-11-25']

const baseline: ReadonlyArray<string> = Option.getOrElse(
  Schema.decodeUnknownOption(Schema.Struct({ failures: Schema.Array(Schema.String) }))(parse(baselineText)).pipe(
    Option.map((document) => document.failures),
  ),
  () => [],
)

// The SEP-2640 skills scenarios belong to no requirement set, so they are
// derived from the vendored registry by extension id instead of by name.
const skillsScenarios: ReadonlyArray<string> = listClientScenarios().filter((name) =>
  getClientScenario(name)?.source.extensionId === SKILLS_EXTENSION_ID
)

interface RunPlanEntry {
  readonly revision: string
  readonly scenario: string
}

// The whole run list, derived and never hand-typed: everything the requirement
// set asks the server leg to run (scored plus `not_scored`) at that revision,
// then the registered skills scenarios at the draft wire they live on.
const runPlan: ReadonlyArray<RunPlanEntry> = [
  ...revisions.flatMap((revision) =>
    scenariosToRun(loadRequirements(revision), 'server').map(
      (scenario): RunPlanEntry => ({ revision, scenario }),
    )
  ),
  ...skillsScenarios.map((scenario): RunPlanEntry => ({ revision: DRAFT_PROTOCOL_VERSION, scenario })),
]

const inPlace = Option.getOrElse(decodeInPlace(upstreamManifestText), () => {
  throw new Error(
    'upstream-tests.json carries no inPlace record in the shape @systemfsoftware/upstream-manifest grades',
  )
})

const scenarioModules = import.meta.glob<ScenarioModule>(
  [
    '../../../../../../repos/mcp-conformance/src/scenarios/server/**/*.ts',
    '!../../../../../../repos/mcp-conformance/src/scenarios/server/**/*.test.ts',
  ],
  { eager: true },
)

// Only the files an in-place record names are searched, keyed by the subtree path the guard grades.
const recordedModules: ReadonlyMap<string, ScenarioModule> = new Map(
  inPlace.flatMap((record) =>
    record.files.flatMap((file): ReadonlyArray<readonly [string, ScenarioModule]> =>
      Option.toArray(
        Option.fromNullishOr(scenarioModules[`../../../../../../${record.subtree}/${file}`]).pipe(
          Option.map((module): readonly [string, ScenarioModule] => [`${record.subtree}/${file}`, module]),
        ),
      )
    )
  ),
)

// Which file defines a scenario is read from the vendored registry: the file whose
// module exports the class the registered instance was built from.
const upstreamFileOf = (scenario: string): Option.Option<string> =>
  Option.fromNullishOr(getClientScenario(scenario)).pipe(
    Option.flatMap((instance) => fileDefining(recordedModules, instance.constructor)),
  )

interface ScenarioOutcome {
  readonly revision: string
  readonly scenario: string
  readonly passed: number
  readonly failures: ReadonlyArray<string>
}

// The only checks allowed to be skipped rather than exercised: this scenario's
// `run()` returns a single `skipCheck` without contacting the server, pending a
// rewrite onto `subscriptions/listen`
// (repos/mcp-conformance/src/scenarios/server/tasks/notifications.ts:42-55).
const SKIPPED_ONLY_EXEMPTION = {
  scenario: 'tasks-status-notifications',
  checkId: 'tasks-status-notifications',
} as const

const isExempt = (scenario: string, checkId: string): boolean =>
  scenario === SKIPPED_ONLY_EXEMPTION.scenario && checkId === SKIPPED_ONLY_EXEMPTION.checkId

const outcomeOf = (revision: string, scenario: string, run: ServerRun): ScenarioOutcome => {
  const passed = run.checks.filter((check) => check.status === 'SUCCESS').length
  const failed = run.checks
    .filter((check) => check.status === 'FAILURE')
    .map((check) => `${revision} ${scenario}: ${check.name}: ${check.errorMessage ?? check.description}`)
  const unexercised = run.checks
    .filter((check) => check.status === 'SKIPPED' && !isExempt(scenario, check.id))
    .map((check) => `${revision} ${scenario}: ${check.name}: check was skipped rather than exercised`)
  const exemptScenario = scenario === SKIPPED_ONLY_EXEMPTION.scenario && run.checks.length > 0
  const vacuous = run.skipped === true || (passed === 0 && !exemptScenario)
    ? [`${revision} ${scenario}: no passing check recorded`]
    : []
  return {
    revision,
    scenario,
    passed,
    failures: [...failed, ...unexercised, ...vacuous],
  }
}

const urlOf = (input: RequestInfo | URL): string =>
  input instanceof URL ? input.href : typeof input === 'string' ? input : input.url

const initOf = (
  init: RequestInit | undefined,
): { readonly method: string; readonly headers: Record<string, string>; readonly body?: string } => ({
  method: init?.method ?? 'GET',
  headers: Object.fromEntries(new Headers(init?.headers)),
  ...(typeof init?.body === 'string' ? { body: init.body } : {}),
})

const EMPTY_BYTES = new Uint8Array(0)

interface StreamReadResult {
  readonly done: boolean
  readonly value?: Uint8Array | undefined
}

interface StreamReader {
  read(): Promise<StreamReadResult>
  cancel(): Promise<void>
}

interface StreamSource {
  getReader(): StreamReader
}

const bytesOrEmpty = (value: Uint8Array | undefined): Uint8Array => value ?? EMPTY_BYTES

const closeQuietly = (controller: ReadableStreamDefaultController<Uint8Array>): void => {
  try {
    controller.close()
  } catch {
    // The stream already closed or was cancelled; nothing left to signal.
  }
}

const pump = (reader: StreamReader, controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> =>
  reader.read().then((result) => {
    if (result.done) {
      closeQuietly(controller)
      return
    }
    controller.enqueue(bytesOrEmpty(result.value))
    return pump(reader, controller)
  })

// The runner ends every long-lived `subscriptions/listen` stream by aborting its
// fetch. A bridged stream that ignores that abort leaves the caller's reader
// pending forever, so the signal must cancel the underlying Worker stream and
// close the bridged one.
const domStream = (
  source: StreamSource,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start: (controller) => {
      const reader = source.getReader()
      const abort = (): void => {
        void reader.cancel().catch(() => {})
        closeQuietly(controller)
      }
      if (signal !== undefined) {
        if (signal.aborted) {
          abort()
          return
        }
        signal.addEventListener('abort', abort, { once: true })
      }
      pump(reader, controller).catch(() => closeQuietly(controller))
    },
  })

const bodyOf = (
  body: StreamSource | null,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> | null => (body === null ? null : domStream(body, signal))

const routeThrough = (harness: Harness['Service']) =>
  Effect.gen(function*() {
    const context = yield* Effect.context<never>()
    const runWith = Effect.runPromiseWith(context)
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      runWith(harness.dispatchFetch(urlOf(input), initOf(init))).then(
        (response) =>
          new Response(bodyOf(response.body, init?.signal ?? undefined), {
            status: response.status,
            headers: Object.fromEntries(response.headers),
          }),
      )
  })

// One workerd for the whole feature: every scenario's fetch, and the runner's undici
// dispatcher, route into the Worker until the suite ends.
const routedHarness = Layer.effectDiscard(
  Effect.gen(function*() {
    const route = yield* routeThrough(yield* Harness)
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const original = globalThis.fetch
        globalThis.fetch = route
        setDispatcher(route)
        return original
      }),
      (original) =>
        Effect.sync(() => {
          globalThis.fetch = original
          setDispatcher(undefined)
        }),
    )
  }),
).pipe(Layer.provideMerge(harnessLayer), Layer.orDie)

// Tags the running test with its in-place file before the run, so a scenario that
// fails still reports which file it executed.
const tagUpstreamFile = (scenario: string): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function*() {
    const file = upstreamFileOf(scenario)
    const context = Option.fromNullishOr(yield* VitestTestContext)
    Option.zipWith(file, context, (path, running) => {
      running.task.meta.upstreamFile = path
    })
    return file
  })

const runEntry = (entry: RunPlanEntry) =>
  Effect.gen(function*() {
    const upstreamFile = yield* tagUpstreamFile(entry.scenario)
    const harness = yield* Harness
    const run = yield* Effect.promise(() =>
      runServerConformanceTest(new URL('/mcp', harness.url).href, entry.scenario, undefined, entry.revision, true)
    )
    return { upstreamFile, outcome: outcomeOf(entry.revision, entry.scenario, run) }
  })

Feature('Running the vendored MCP conformance suite against the mounted fixture Worker', { timeout: 0 })
  .withLayer(routedHarness)
  .live('a real workerd runtime dispatch serves every scenario in-process')
  .body(({ scenario }) => {
    runPlan.forEach((entry) => {
      scenario(
        `${entry.revision} ${entry.scenario} passes through the Worker`,
        Gherkin.Do.pipe(
          When('the scenario runs from its in-place file through the Worker')('result', () => runEntry(entry)),
          Then('it names a recorded in-place file and reports no failed check')((scope, expect) =>
            expect({
              recorded: Option.isSome(scope.result.upstreamFile),
              failures: scope.result.outcome.failures.filter((failure) => !baseline.includes(failure)),
            }).toEqual({ recorded: true, failures: [] })
          ),
        ),
      )
    })
  })

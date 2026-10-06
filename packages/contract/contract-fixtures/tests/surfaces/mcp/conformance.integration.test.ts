import { loadRequirements, scenariosToRun } from '#mcp-conformance/requirements.js'
import { runServerConformanceTest, type ServerRun } from '#mcp-conformance/runner/index.js'
import { getClientScenario, listClientScenarios } from '#mcp-conformance/scenarios/index.js'
import { SKILLS_EXTENSION_ID } from '#mcp-conformance/scenarios/server/skills/helpers.js'
import { DRAFT_PROTOCOL_VERSION } from '#mcp-conformance/types.js'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { bundleWith, Harness, type HarnessStartFailed, layer } from '@systemfsoftware/effect-workerd-harness'
import { Effect, Layer, Option, Schema } from 'effect'
import { parse } from 'yaml'
import upstreamManifestText from '../../../upstream-tests.json?raw'
import baselineText from './__fixtures__/conformance-baseline.yml?raw'
import { freeLoopbackOrigin } from './__fixtures__/loopback-port.fixture.js'
import { setDispatcher } from './__fixtures__/undici.fixture.js'
import { decodeUpstreamManifest, scenarioFiles } from './__fixtures__/upstream-manifest.fixture.js'

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

const manifest = Option.getOrElse(
  decodeUpstreamManifest(upstreamManifestText),
  () => {
    throw new Error('upstream-tests.json is not an in-place manifest with a root, commit and tests per record')
  },
)

const fileOf: ReadonlyMap<string, string> = scenarioFiles(manifest)

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

interface RunResult {
  readonly outcomes: ReadonlyArray<ScenarioOutcome>
  readonly unmapped: ReadonlyArray<string>
  readonly expectedCount: number
}

const runScenarios = (): Effect.Effect<RunResult, HarnessStartFailed> =>
  Effect.gen(function*() {
    const harness = yield* Harness
    const endpoint = new URL('/mcp', harness.url).href
    const context = yield* Effect.context<never>()
    const runWith = Effect.runPromiseWith(context)
    const route = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      runWith(harness.dispatchFetch(urlOf(input), initOf(init))).then(
        (response) =>
          new Response(bodyOf(response.body, init?.signal ?? undefined), {
            status: response.status,
            headers: Object.fromEntries(response.headers),
          }),
      )
    const original = globalThis.fetch
    globalThis.fetch = route
    setDispatcher(route)
    const restore = Effect.sync(() => {
      globalThis.fetch = original
      setDispatcher(undefined)
    })
    const outcomes = yield* Effect.forEach(
      runPlan,
      (entry) =>
        Effect.gen(function*() {
          yield* Effect.logInfo(
            `[mcp-conformance] ${entry.revision} ${entry.scenario} ${
              fileOf.get(entry.scenario) ?? '<no in-place record>'
            }`,
          )
          const run = yield* Effect.promise(() =>
            runServerConformanceTest(endpoint, entry.scenario, undefined, entry.revision, true)
          )
          return outcomeOf(entry.revision, entry.scenario, run)
        }),
      { concurrency: 1 },
    )
    return yield* Effect.succeed({
      outcomes,
      unmapped: runPlan.filter((entry) => !fileOf.has(entry.scenario)).map((entry) => entry.scenario),
      expectedCount: runPlan.length,
    }).pipe(Effect.ensuring(restore))
  }).pipe(Effect.provide(harnessLayer))

Feature('Running the vendored MCP conformance suite against the mounted fixture Worker', { timeout: 0 })
  .withScenarioLayer(Layer.empty)
  .live('a real workerd runtime dispatch serves every scenario in-process')
  .body(({ scenario }) => {
    scenario(
      'Every server scenario the requirement sets name, plus the registered skills scenarios, passes',
      Gherkin.Do.pipe(
        When('every derived scenario runs through the Worker and names its in-place file')(
          'results',
          () => runScenarios(),
        ),
        Then('every scenario is mapped to an in-place record and reports no failed check')((scope, expect) => {
          const { expectedCount, outcomes, unmapped } = scope.results
          const failures = outcomes
            .flatMap((outcome) => outcome.failures)
            .filter((failure) => !baseline.includes(failure))
          return expect({ failures, unmapped, scenarioCount: outcomes.length }).toEqual({
            failures: [],
            unmapped: [],
            scenarioCount: expectedCount,
          })
        }),
      ),
    )
  })

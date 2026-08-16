/**
 * Fleet tests — the registry (live rows recorded by `ContainerHandle
 * .fromRunning`), and the merged listing: live rows carry the full portrait
 * with a bounded log tail; ledger rows (this run's entries with recorded
 * ids) get their state from a live inspect and tail from logs; ledger-only
 * rows carry no image/ports (the ledger is names-only by design); a ledger
 * row already live is de-duplicated. All backend reads are driven by a
 * recording `SandboxRuntime` double — no real containers here.
 *
 * Test callbacks are promise-returning (no `async` keyword): this package's
 * effect tsconfig profile bans async function declarations even in tests.
 */
import { Effect, Layer } from 'effect'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { appendSandboxEntry, writeRunRecord } from '../../lifecycle/hygiene/ledger.js'
import type { ContainerSpec } from '../../model/container-spec.schema.js'
import { RightsizeConfig } from '../../runtime/config.js'
import { RunId } from '../../runtime/run-id.js'
import type { ContainerInspect, SandboxRuntimeService } from '../../runtime/runtime.js'
import { SandboxRuntime } from '../../runtime/runtime.js'
import { boundedTail, listFleetContainers } from '../fleet.js'
import { ContainerHandle } from '../handle.js'
import { _resetRegistryForTests, listLiveContainers, recordContainer, unregisterContainer } from '../registry.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A fully-typed container portrait (fromRunning requires the real spec shape). */
const baseSpec = (id: string): ContainerSpec => ({
  name: `rz-run-${id}`,
  image: 'alpine:3.19',
  env: [],
  ports: [{ hostPort: 49201, guestPort: 6379 }],
  mounts: [],
  aliases: [],
  runId: 'runid',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
})

const runLike = (id: string) => ({
  backend: 'docker' as const,
  handle: { id, spec: baseSpec(id) },
  spec: baseSpec(id),
})

/** A recording runtime double: scripted logs/inspect, counting every call. */
const runtimeDouble = (script: {
  readonly logs?: Record<string, string> | undefined
  readonly inspect?: Record<string, ContainerInspect> | undefined
}) => {
  const calls: string[] = []
  const service: SandboxRuntimeService = {
    name: 'docker',
    capabilities: {
      hardwareIsolated: false,
      checkpoint: true,
      checkpointRestartsWorkload: false,
      supportsNativeNetworks: true,
      healthInspection: true,
    },
    create: () => Effect.succeed({ id: 'never', spec: baseSpec('never') }),
    start: () => Effect.void,
    stop: () => Effect.void,
    remove: () => Effect.void,
    exec: (_handle, request) => Effect.succeed({ exitCode: 0, stdout: JSON.stringify(request.command), stderr: '' }),
    logs: (handle) => {
      calls.push(`logs:${handle.id}`)
      return Effect.succeed(script.logs?.[handle.id] ?? '')
    },
    followLogs: (_handle, _consumer) => Effect.succeed({ close: Effect.void }),
    copyToContainer: () => Effect.void,
    copyFromContainer: () => Effect.void,
    inspect: (handle) => {
      calls.push(`inspect:${handle.id}`)
      return Effect.succeed(script.inspect?.[handle.id] ?? { exists: true, running: true, health: undefined })
    },
    removeByName: () => Effect.void,
    findRunning: () => Effect.never, // never exercised on these surfaces
  }
  return { service, calls }
}

const fleetLayer = (runtime: SandboxRuntimeService, cacheDir: string) =>
  Layer.mergeAll(
    Layer.succeed(SandboxRuntime, runtime),
    Layer.succeed(RightsizeConfig, {
      backend: 'auto',
      reaper: 'on',
      cacheDir,
      reuse: false,
      msbPath: undefined,
      msbSkipDownload: false,
    }),
  )

/** A temp cache dir for one test, removed on every path. */
const withTempDir = <A>(body: (dir: string) => PromiseLike<A>): Promise<A> =>
  fsp.mkdtemp(join(os.tmpdir(), 'rz-fleet-')).then((dir) =>
    body(dir).then(
      (value) => fsp.rm(dir, { recursive: true, force: true }).then(() => value),
      (error: unknown) => fsp.rm(dir, { recursive: true, force: true }).then(() => Promise.reject(error)),
    )
  )

/** Seeds one dead foreign run with a sandbox (id recorded), a pre-create sandbox, and a network. */
const seedLedger = (dir: string, runId: string): Promise<void> =>
  writeRunRecord(dir, runId, { pid: 999_999, startedIso: '2026-01-01T00:00:00.000Z', backend: 'docker' }).then(() =>
    appendSandboxEntry(dir, runId, { kind: 'sandbox', backend: 'docker', name: 'rz-other-1', id: 'ledger-box' }).then(
      () => appendSandboxEntry(dir, runId, { kind: 'sandbox', backend: 'docker', name: 'rz-other-2' }),
    )
  )

// ===========================================================================
// Registry
// ===========================================================================

describe('registry (the live view)', () => {
  it('Should_RecordRowsInStartOrder_When_HandlesAreMinted', () => {
    _resetRegistryForTests()
    ContainerHandle.fromRunning(runLike('c1'))
    ContainerHandle.fromRunning(runLike('c2'))
    expect(listLiveContainers().map((row) => row.id)).toEqual(['c1', 'c2'])
    unregisterContainer('docker', 'c1')
    expect(listLiveContainers().map((row) => row.id)).toEqual(['c2'])
    _resetRegistryForTests()
  })
})

// ===========================================================================
// The merged listing
// ===========================================================================

describe('listFleetContainers — the merged live + ledger view', () => {
  it('Should_MergeLiveAndLedgerRows_When_TheRegistryHoldsLivePortraits', () =>
    withTempDir((dir) => {
      _resetRegistryForTests()
      recordContainer({
        backend: 'docker',
        id: 'live-1',
        name: 'rz-run-live-1',
        image: 'alpine:3.19',
        ports: [{ hostPort: 49201, guestPort: 6379 }],
      })
      const { service, calls } = runtimeDouble({
        logs: { 'live-1': 'line1\nline2\n', 'ledger-box': 'ledger-line\n' },
        inspect: { 'ledger-box': { exists: true, running: false, health: undefined } },
      })
      return seedLedger(dir, RunId.value).then(() =>
        Effect.runPromise(Effect.provide(listFleetContainers(), fleetLayer(service, dir))).then((rows) => {
          expect(rows).toHaveLength(2)
          expect(rows[0]).toEqual({
            source: 'live',
            backend: 'docker',
            name: 'rz-run-live-1',
            id: 'live-1',
            image: 'alpine:3.19',
            host: '127.0.0.1',
            state: 'running',
            ports: [{ hostPort: 49201, guestPort: 6379 }],
            logTail: ['line1', 'line2'],
          })
          expect(rows[1]).toEqual({
            source: 'ledger',
            backend: 'docker',
            name: 'rz-other-1',
            id: 'ledger-box',
            image: '', // the ledger is names-only — never fabricated
            host: '127.0.0.1',
            state: 'stopped', // the live inspect verdict (running: false)
            ports: [],
            logTail: ['ledger-line'],
          })
          // The ledger row was probed exactly twice (inspect + logs); the
          // live row only for its tail.
          expect(calls).toEqual(['logs:live-1', 'inspect:ledger-box', 'logs:ledger-box'])
        })
      )
    }))

  it('Should_DeduplicateLedgerRows_When_TheSameContainerIsAlsoLive', () =>
    withTempDir((dir) => {
      _resetRegistryForTests()
      recordContainer({
        backend: 'docker',
        id: 'dup-box',
        name: 'rz-dedup-1',
        image: 'x:1',
        ports: [],
      })
      const { service } = runtimeDouble({ logs: { 'dup-box': 'both\n' } })
      return seedLedger(dir, 'fleet-dedupe').then(() =>
        appendSandboxEntry(dir, 'fleet-dedupe', {
          kind: 'sandbox',
          backend: 'docker',
          name: 'rz-dedup-1',
          id: 'dup-box',
        }).then(() =>
          Effect.runPromise(Effect.provide(listFleetContainers(), fleetLayer(service, dir))).then((rows) => {
            expect(rows).toHaveLength(1) // one live row, no duplicate ledger row
            expect(rows[0]?.source).toBe('live')
            expect(rows[0]?.id).toBe('dup-box')
            return undefined
          })
        )
      )
    }))

  it('Should_ReportTheLiveInspectState_When_TheBackendAnswers', () =>
    withTempDir((dir) => {
      _resetRegistryForTests()
      const { service } = runtimeDouble({
        logs: {},
        inspect: {
          'stopped-box': { exists: true, running: false, health: undefined },
          'gone-box': { exists: false, running: false, health: undefined },
        },
      })
      return writeRunRecord(dir, RunId.value, { pid: 1, startedIso: '2026-01-01', backend: 'docker' })
        .then(() =>
          appendSandboxEntry(dir, RunId.value, {
            kind: 'sandbox',
            backend: 'docker',
            name: 'rz-2-a',
            id: 'stopped-box',
          })
        )
        .then(() =>
          appendSandboxEntry(dir, RunId.value, { kind: 'sandbox', backend: 'docker', name: 'rz-2-b', id: 'gone-box' })
        )
        .then(() =>
          Effect.runPromise(
            Effect.provide(
              listFleetContainers().pipe(
                Effect.map((rows) => rows.filter((row) => row.source === 'ledger').map((row) => row.state)),
              ),
              fleetLayer(service, dir),
            ),
          )
        )
        .then((states) => {
          expect(states).toEqual(['stopped', 'missing'])
          return undefined
        })
    }))
})

describe('boundedTail', () => {
  it('Should_KeepTheMostRecentLines_When_ThereAreMoreThanTheBudget', () => {
    const text = Array.from({ length: 120 }, (_, i) => `line-${i}`).join('\n')
    const tail = boundedTail(text, 50)
    expect(tail).toHaveLength(50)
    expect(tail[0]).toBe('line-70')
    expect(boundedTail('\n\n', 5)).toEqual([])
  })
})

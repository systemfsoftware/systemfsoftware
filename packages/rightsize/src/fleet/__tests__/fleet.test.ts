/**
 * The fleet listing (R15) — `listFleetContainers` over a scripted runtime
 * and an inert config: live registry rows are listed with their name, port
 * map, and bounded log tail; ledger rows with a recorded id are read and
 * reported (a missing container degrades to a `'missing'` row WITHOUT
 * failing the listing); and backends other than docker carry their backend
 * in every row.
 */
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

import { runEntriesPath } from '../../lifecycle/hygiene/ledger.js'
import { RightsizeConfig } from '../../runtime/config.js'
import type { RightsizeConfigService } from '../../runtime/config.js'
import { RunId } from '../../runtime/run-id.js'
import type { ContainerInspect, SandboxHandle, SandboxRuntimeService } from '../../runtime/runtime.js'
import { SandboxRuntime } from '../../runtime/runtime.js'
import { type FleetContainer, listFleetContainers } from '../fleet.js'
import { _resetRegistryForTests, recordContainer } from '../registry.js'

const CACHE_ROOT = '/tmp/rightsize-fleet-test'

/** The scripted runtime — inspect verdicts and log text are queues the test feeds. */
interface ScriptedState {
  readonly inspectRows: Array<
    { readonly exists: boolean; readonly running: boolean; readonly health: ContainerInspect['health'] }
  >
  logText: string
}

interface ScriptedRuntime {
  readonly state: ScriptedState
  readonly service: SandboxRuntimeService
}

const scriptedRuntime = (): ScriptedRuntime => {
  const state: ScriptedState = {
    inspectRows: [],
    logText: '',
  }
  const service: SandboxRuntimeService = {
    name: 'docker',
    capabilities: {
      hardwareIsolated: false,
      checkpoint: true,
      checkpointRestartsWorkload: false,
      supportsNativeNetworks: true,
      healthInspection: true,
    },
    create: () => Effect.never,
    start: () => Effect.never,
    stop: () => Effect.never,
    remove: () => Effect.never,
    exec: () => Effect.succeed({ exitCode: 0, stdout: '', stderr: '' }),
    logs: () => Effect.succeed(state.logText),
    followLogs: () => Effect.never,
    copyToContainer: () => Effect.never,
    copyFromContainer: () => Effect.never,
    inspect: () => {
      const row = state.inspectRows.shift()
      return Effect.succeed(row ?? { exists: true, running: true, health: undefined })
    },
    removeByName: () => Effect.never,
    findRunning: () => {
      const none: SandboxHandle | undefined = undefined
      return Effect.succeed(none)
    },
  }
  return { state, service }
}

const runtimeLayer = (runtime: ScriptedRuntime): Layer.Layer<SandboxRuntime> =>
  Layer.succeed(SandboxRuntime, runtime.service)

const configOf = (cacheDir: string): RightsizeConfigService => ({
  backend: 'auto',
  reaper: 'off',
  cacheDir,
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: true,
})

const runListing = (runtime: ScriptedRuntime, cacheDir: string = CACHE_ROOT) =>
  Effect.runPromise(
    listFleetContainers().pipe(
      Effect.provide(
        Layer.mergeAll(
          runtimeLayer(runtime),
          Layer.succeed(RightsizeConfig, configOf(cacheDir)),
        ),
      ),
    ),
  )

/** Writes this run's ledger entries file so `listFleetContainers` reads the rows. */
const writeLedger = (
  cacheDir: string,
  entries: ReadonlyArray<
    { readonly kind: 'sandbox'; readonly backend: string; readonly name: string; readonly id?: string }
  >,
): Promise<void> =>
  fsp.mkdir(path.dirname(runEntriesPath(cacheDir, RunId.value)), { recursive: true }).then(() =>
    fsp.writeFile(
      runEntriesPath(cacheDir, RunId.value),
      entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    )
  )

/** The single listed row, or a loud failure when the listing shape is wrong. */
const onlyRow = (rows: ReadonlyArray<FleetContainer>): FleetContainer => {
  if (rows.length !== 1) {
    throw new Error(`expected exactly one fleet row, got ${rows.length}`)
  }
  const row = rows[0]
  if (row === undefined) {
    throw new Error('no fleet row present')
  }
  return row
}

describe('listFleetContainers', () => {
  it('Should_ListLiveRowsWithNameAndPorts_When_TheRegistryHoldsStartedContainers', () => {
    _resetRegistryForTests()
    const runtime = scriptedRuntime()
    runtime.state.logText = 'first-line\nsecond-line'
    recordContainer({
      backend: 'docker',
      id: 'cid-live-1',
      name: 'rz-abc12345-1',
      image: 'redis:8.2-alpine',
      ports: [{ guestPort: 6379, hostPort: 41234 }],
    })
    return runListing(runtime).then((rows) => {
      expect(rows).toHaveLength(1)
      const row = onlyRow(rows)
      expect(row.source).toBe('live')
      expect(row.name).toBe('rz-abc12345-1')
      expect(row.image).toBe('redis:8.2-alpine')
      expect(row.state).toBe('running')
      expect(row.host).toBe('127.0.0.1')
      expect(row.ports).toEqual([{ guestPort: 6379, hostPort: 41234 }])
      // The bounded tail is fetched through the runtime, most-recent line last.
      expect(row.logTail).toEqual(['first-line', 'second-line'])
    })
  })

  it('Should_ReportLedgerRowsAsMissing_When_TheContainerIsGoneWithoutThrowing', () => {
    const cacheDir = `${CACHE_ROOT}-ledger-missing`
    _resetRegistryForTests()
    return writeLedger(cacheDir, [
      { kind: 'sandbox', backend: 'docker', name: 'rz-abcdef01-7', id: 'cid-ledger-7' },
    ]).then(() => {
      const runtime = scriptedRuntime()
      runtime.state.inspectRows.push({ exists: false, running: false, health: undefined })
      return runListing(runtime, cacheDir)
    }).then((rows) => {
      expect(rows).toHaveLength(1)
      const row = onlyRow(rows)
      expect(row.source).toBe('ledger')
      expect(row.name).toBe('rz-abcdef01-7')
      expect(row.id).toBe('cid-ledger-7')
      // A missing container degrades the row — it never fails the listing.
      expect(row.state).toBe('missing')
      expect(row.ports).toEqual([])
    })
  })

  it('Should_ListMsbRowsWithTheirBackend_When_TheLiveRegistryHoldsMsbContainers', () => {
    _resetRegistryForTests()
    const runtime = scriptedRuntime()
    recordContainer({
      backend: 'msb',
      id: 'sandbox-msb-1',
      name: 'rz-abcdef02-1',
      image: '',
      ports: [],
    })
    return runListing(runtime).then((rows) => {
      expect(rows).toHaveLength(1)
      const row = onlyRow(rows)
      expect(row.source).toBe('live')
      expect(row.backend).toBe('msb')
      expect(row.name).toBe('rz-abcdef02-1')
      expect(row.state).toBe('running')
    })
  })

  it('Should_SkipLedgerMarkers_When_TheEntriesCarryNoBackendId', () => {
    const cacheDir = `${CACHE_ROOT}-ledger-idless`
    _resetRegistryForTests()
    return writeLedger(cacheDir, [
      { kind: 'sandbox', backend: 'docker', name: 'rz-abcdef03-1' },
    ]).then(() => {
      const runtime = scriptedRuntime()
      return runListing(runtime, cacheDir)
    }).then((rows) => {
      // The ledger is names-only for markers recorded before create resolved;
      // a marker with no backend id is never emitted as a row — and never
      // throws the listing.
      expect(rows).toEqual([])
    })
  })
})

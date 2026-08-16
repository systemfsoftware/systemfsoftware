/**
 * Diagnostics tests — the typed report built from the live registry (the
 * invariant: membership and state come from the registry, never a backend
 * query; only the log tails hit the backend) and the pure renderer's
 * losslessness contract (every row field and every log line appears in the
 * rendered text, in order, nothing elided).
 *
 * Test callbacks are promise-returning (no `async` keyword): this package's
 * effect tsconfig profile bans async function declarations even in tests.
 */
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

import type { ContainerSpec } from '../../model/container-spec.schema.js'
import type { DiagnosticsReport } from '../../model/diagnostics.schema.js'
import { BackendError } from '../../model/errors.js'
import type { FollowHandle, SandboxRuntimeService } from '../../runtime/runtime.js'
import { SandboxRuntime } from '../../runtime/runtime.js'
import { renderDiagnostics, reportDiagnostics } from '../diagnostics.js'
import { _resetRegistryForTests, recordContainer } from '../registry.js'

const baseSpec = (id: string): ContainerSpec => ({
  name: `rz-diag-${id}`,
  image: `image-${id}:1`,
  env: [],
  ports: [{ hostPort: 50_000 + id.length, guestPort: 8080 }],
  mounts: [],
  aliases: [],
  runId: 'diag-run',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
})

/** A runtime double whose logs are scripted per id and whose calls are counted. */
const recordingRuntime = (logs: Record<string, string>) => {
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
    exec: (_h, _r) => Effect.succeed({ exitCode: 0, stdout: '', stderr: '' }),
    logs: (handle) => {
      calls.push(`logs:${handle.id}`)
      return Effect.succeed(logs[handle.id] ?? '')
    },
    followLogs: (): Effect.Effect<FollowHandle, BackendError> => Effect.succeed({ close: Effect.void }),
    copyToContainer: () => Effect.void,
    copyFromContainer: () => Effect.void,
    inspect: () => Effect.succeed({ exists: true, running: true, health: undefined }),
    removeByName: () => Effect.void,
    findRunning: () => Effect.never, // never exercised on these surfaces
  }
  return { service, calls }
}

const diagLayer = (runtime: SandboxRuntimeService) => Layer.succeed(SandboxRuntime, runtime)

describe('reportDiagnostics — the registry-driven report', () => {
  it('Should_ReportEveryLiveContainerInStartOrder_When_TheRegistryHoldsRows', () => {
    _resetRegistryForTests()
    recordContainer({
      backend: 'docker',
      id: 'a1',
      name: 'rz-diag-a1',
      image: 'alpine:3.19',
      ports: [{ hostPort: 50001, guestPort: 8080 }],
    })
    recordContainer({
      backend: 'docker',
      id: 'a2',
      name: 'rz-diag-a2',
      image: 'nginx:1.27',
      ports: [],
    })
    const runtime = recordingRuntime({ 'a1': 'said hi\n', 'a2': 'x\n' })
    return Effect.runPromise(Effect.provide(reportDiagnostics, diagLayer(runtime.service))).then((report) => {
      expect(report.containers).toHaveLength(2)
      expect(report.containers[0]).toEqual({
        name: 'rz-diag-a1',
        image: 'alpine:3.19',
        state: 'running',
        host: '127.0.0.1',
        ports: [{ hostPort: 50001, guestPort: 8080 }],
        logTailLines: ['said hi'],
      })
      expect(report.containers[1]?.state).toBe('running')
      expect(runtime.calls).toEqual(['logs:a1', 'logs:a2']) // tails only — membership never queried
    })
  })

  it('Should_DegradeToEmptyTails_When_TheBackendLogsCallFails', () => {
    _resetRegistryForTests()
    recordContainer({ backend: 'docker', id: 'dead', name: 'rz-diag-dead', image: 'x:1', ports: [] })
    const runtime: SandboxRuntimeService = {
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
      exec: (_h, _r) => Effect.succeed({ exitCode: 0, stdout: '', stderr: '' }),
      logs: () => Effect.fail(BackendError.make({ message: 'daemon down' })),
      followLogs: () => Effect.succeed({ close: Effect.void }),
      copyToContainer: () => Effect.void,
      copyFromContainer: () => Effect.void,
      inspect: () => Effect.succeed({ exists: true, running: true, health: undefined }),
      removeByName: () => Effect.void,
      findRunning: () => Effect.never, // never exercised on these surfaces
    }
    return Effect.runPromise(Effect.provide(reportDiagnostics, diagLayer(runtime)))
      .then((report) => {
        expect(report.containers[0]?.logTailLines).toEqual([])
      })
  })
})

describe('renderDiagnostics — the lossless text projection', () => {
  it('Should_RenderEveryField_When_TheReportCarriesContainers', () => {
    const report: DiagnosticsReport = {
      containers: [
        {
          name: 'rz-diag-a1',
          image: 'alpine:3.19',
          state: 'running',
          host: '127.0.0.1',
          ports: [{ hostPort: 50001, guestPort: 8080 }],
          logTailLines: ['first line', 'unusual\tline'],
        },
        {
          name: 'rz-diag-a2',
          image: 'nginx:1.27',
          state: 'running',
          host: '127.0.0.1',
          ports: [],
          logTailLines: [],
        },
      ],
    }
    const text = renderDiagnostics(report)
    for (
      const needle of [
        'alpine:3.19',
        'rz-diag-a1',
        'nginx:1.27',
        'rz-diag-a2',
        '127.0.0.1',
        '8080',
        '50001',
        'first line',
        'unusual\tline',
      ]
    ) {
      expect(text).toContain(needle)
    }
    // Block order: container 2's block comes after container 1's.
    expect(text.indexOf('rz-diag-a1')).toBeLessThan(text.indexOf('rz-diag-a2'))
    expect(text).toContain('2 running container(s)')
    // Port lines are per binding and named.
    expect(text).toContain('8080/tcp -> 127.0.0.1:50001')
  })

  it('Should_ReportZeroContainers_When_TheReportIsEmpty', () => {
    expect(renderDiagnostics({ containers: [] })).toBe('rightsize diagnostics — 0 running container(s)')
  })
})

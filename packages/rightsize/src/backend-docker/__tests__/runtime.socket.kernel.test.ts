/**
 * Docker `SandboxRuntime` adapter tests over a scripted fake daemon socket:
 * create/start/stop/remove/exec/logs/follow/inspect/removeByName/findRunning
 * — every wire call, payload and stream mapping asserted against the fake's
 * recordings. No real containers run here (U7's parity lane owns that).
 *
 * Test callbacks are promise-returning (no `async` keyword): this package's
 * effect tsconfig profile bans async function declarations even in tests.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import type { ContainerSpec } from '../../model/container-spec.schema.js'
import { BackendError, PortBindConflictError } from '../../model/errors.js'
import type { FollowHandle, SandboxHandle } from '../../runtime/runtime.js'
import { makeDockerClient } from '../client.js'
import { makeDockerNetworks } from '../networks.adapter.js'
import { makeDockerRuntime } from '../runtime.adapter.js'
import { withDaemon } from './fake-daemon.js'

/** Runs a follow handle's close effect to completion. */
const effectClose = (follow: FollowHandle): Promise<void> => Effect.runPromise(follow.close)

/** One multiplexed demux frame: `[streamType, 0, 0, 0, len_be, payload]`. */
const frame = (streamType: number, payload: string | Uint8Array): Buffer => {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  const out = Buffer.alloc(8 + bytes.length)
  out[0] = streamType
  out.writeUInt32BE(bytes.length, 4)
  bytes.copy(out, 8)
  return out
}

/** A deterministic wait for `count` delivered lines — the reader resolves it from the consumer callback, no timers. */
const lineGate = (
  received: string[],
  count: number,
): { readonly got: Promise<void>; readonly onLine: (line: string) => void } => {
  const { promise, resolve } = Promise.withResolvers<void>()
  return {
    got: promise,
    onLine: (line: string) => {
      received.push(line)
      if (received.length >= count) {
        resolve()
      }
    },
  }
}

const baseSpec = (overrides: Partial<ContainerSpec> = {}): ContainerSpec => ({
  name: 'rz-deadbeef-1',
  image: 'alpine:3.19',
  env: [],
  ports: [{ hostPort: 49213, guestPort: 6379 }],
  mounts: [],
  aliases: [],
  runId: 'deadbeef',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
  ...overrides,
})

const handleFor = (id: string): SandboxHandle => ({ id, spec: baseSpec({ name: `rz-${id}` }) })

const runtimeFor = (socketPath: string) =>
  makeDockerRuntime(makeDockerClient(socketPath), makeDockerNetworks(makeDockerClient(socketPath)))

describe('create', () => {
  it('Should_CreateWithReaperLabelsAndLoopbackPorts_When_TheImageWasMissingAndPulled', () =>
    withDaemon(
      [
        { status: 404, body: 'no such image' }, // image inspect → missing
        { status: 200, body: '{}' }, // image pull
        { status: 201, body: JSON.stringify({ Id: 'daemon-id-42' }) }, // container create
      ],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).create(baseSpec())).then((handle) => {
          expect(handle.id).toBe('daemon-id-42')
          expect(daemon.requests).toHaveLength(3)
          expect(daemon.requests[0]?.method).toBe('GET')
          expect(daemon.requests[0]?.url).toBe('/images/alpine%3A3.19/json')
          expect(daemon.requests[1]?.url).toBe('/images/create?fromImage=alpine&tag=3.19')
          expect(daemon.requests[2]?.url).toBe('/containers/create?name=rz-deadbeef-1')
          const createBody = JSON.parse(daemon.requests[2]?.body ?? '{}') as Record<string, unknown>
          expect(createBody['Labels']).toEqual({ 'dev.rightsize.runId': 'deadbeef' })
          expect(
            Object.keys(
              (createBody['HostConfig'] as Record<string, unknown>)['PortBindings'] as Record<string, unknown>,
            ),
          ).toEqual([
            '6379/tcp',
          ])
          expect(createBody['ExposedPorts']).toEqual({ '6379/tcp': {} })
        }),
    ))

  it('Should_SkipThePull_When_TheImageAlreadyExists', () =>
    withDaemon(
      [
        { status: 200, body: '{}' }, // image present
        { status: 201, body: JSON.stringify({ Id: 'c' }) },
      ],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).create(baseSpec())).then(() => {
          expect(daemon.requests).toHaveLength(2)
          expect(daemon.requests[1]?.url).toBe('/containers/create?name=rz-deadbeef-1')
        }),
    ))
})

describe('start', () => {
  it('Should_TreatBothStatusesAsSuccess_When_TheDaemonAnswers204Or304', () =>
    withDaemon(
      [{ status: 204, body: '' }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).start(handleFor('c1'))).then(() => {
          expect(daemon.requests[0]?.method).toBe('POST')
          expect(daemon.requests[0]?.url).toBe('/containers/c1/start')
        }),
    ))

  it('Should_ClassifyBindConflicts_When_TheDaemonReportsAPortInUse500', () =>
    withDaemon(
      [{ status: 500, body: 'driver failed programming external connectivity: address already in use' }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).start(handleFor('c1'))).then(
          () => Promise.reject(new Error('expected PortBindConflictError')),
          (error: unknown) => {
            expect(error).toBeInstanceOf(PortBindConflictError)
          },
        ),
    ))

  it('Should_FailWithBackendError_When_StartFailsForAnotherReason', () =>
    withDaemon(
      [{ status: 500, body: 'container already stopped' }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).start(handleFor('c1'))).then(
          () => Promise.reject(new Error('expected BackendError')),
          (error: unknown) => {
            expect(error).toBeInstanceOf(BackendError)
          },
        ),
    ))
})

describe('exec', () => {
  it('Should_ReturnSeparatedStreamsAndTheExitCodeVerdict_When_TheExecStreamsDemuxAndInspectAnswers', () =>
    withDaemon(
      [
        { status: 201, body: JSON.stringify({ Id: 'exec-1' }) }, // exec create
        { status: 200, body: Buffer.concat([frame(1, 'hi\n'), frame(2, 'err\n')]) }, // exec start stream
        { status: 200, body: JSON.stringify({ Running: false, ExitCode: 3, Pid: 0 }) }, // exec inspect
      ],
      (daemon) =>
        Effect.runPromise(
          runtimeFor(daemon.socketPath).exec(handleFor('c1'), {
            command: ['echo', 'hi'],
            workingDir: '/work',
            env: [['A', 'b']],
          }),
        ).then((result) => {
          expect(result).toEqual({ exitCode: 3, stdout: 'hi\n', stderr: 'err\n' })
          expect(daemon.requests[0]?.url).toBe('/containers/c1/exec')
          const createBody = JSON.parse(daemon.requests[0]?.body ?? '{}') as Record<string, unknown>
          expect(createBody).toMatchObject({
            AttachStdout: true,
            AttachStderr: true,
            Cmd: ['echo', 'hi'],
            WorkingDir: '/work',
            Env: ['A=b'],
          })
          expect(daemon.requests[1]?.url).toBe('/exec/exec-1/start')
          expect(JSON.parse(daemon.requests[1]?.body ?? '{}')).toEqual({ Detach: false })
          expect(daemon.requests[2]?.url).toBe('/exec/exec-1/json')
        }),
    ))

  it('Should_InterleaveFramesWithoutLoss_When_TheyShareAChunk', () =>
    withDaemon(
      [
        { status: 201, body: JSON.stringify({ Id: 'exec-2' }) },
        { status: 200, body: Buffer.concat([frame(1, 'a'), frame(2, 'b'), frame(1, 'c')]) },
        { status: 200, body: JSON.stringify({ Running: false, ExitCode: 0, Pid: 0 }) },
      ],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).exec(handleFor('c2'), { command: ['x'], env: [] })).then(
          (result) => {
            expect(result).toEqual({ exitCode: 0, stdout: 'ac', stderr: 'b' })
          },
        ),
    ))
})

describe('logs', () => {
  it('Should_ReturnJoinedNewlineTerminatedLines_When_TheDaemonStreamsFrames', () =>
    withDaemon(
      [{ status: 200, body: Buffer.concat([frame(1, 'one\n'), frame(2, 'two\npartial')]) }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).logs(handleFor('c1'))).then((logs) => {
          expect(logs).toBe('one\ntwo\npartial\n')
          expect(daemon.requests[0]?.url).toBe('/containers/c1/logs?stdout=1&stderr=1&tail=1000')
        }),
    ))
})

describe('followLogs', () => {
  it('Should_DeliverInArrivalOrder_When_CloseNeverFlushesTheTrailingFragment', () =>
    withDaemon(
      [{ status: 200, body: Buffer.concat([frame(1, 'a\n'), frame(2, 'b\n'), frame(1, 'par')]), streamOpen: true }],
      (daemon) => {
        const runtime = runtimeFor(daemon.socketPath)
        const received: string[] = []
        const gate = lineGate(received, 2)
        let follow: FollowHandle
        return Effect.runPromise(runtime.followLogs(handleFor('c1'), gate.onLine))
          .then((handle) => {
            follow = handle
            return gate.got
          })
          .then(() => effectClose(follow))
          .then(() => {
            expect(received).toEqual(['a', 'b']) // explicit close never flushes the trailing fragment
            return undefined
          })
      },
    ))

  it('Should_FlushTheTrailingFragment_When_TheStreamEndsNaturally', () =>
    withDaemon([{ status: 200, body: Buffer.concat([frame(1, 'x\n'), frame(2, 'y')]) }], (daemon) => {
      const runtime = runtimeFor(daemon.socketPath)
      const received: string[] = []
      const gate = lineGate(received, 2)
      let follow: FollowHandle
      return Effect.runPromise(runtime.followLogs(handleFor('c1'), gate.onLine))
        .then((handle) => {
          follow = handle
          return gate.got
        })
        .then(() => effectClose(follow))
        .then(() => {
          expect(received).toEqual(['x', 'y'])
        })
    }))
})

describe('inspect', () => {
  it('Should_SurfaceRunningAndHealth_When_TheDaemonInspectsHealthy', () =>
    withDaemon(
      [
        {
          status: 200,
          body: JSON.stringify({
            Id: 'c1',
            Name: '/rz-deadbeef-1',
            State: {
              Status: 'running',
              Running: true,
              Paused: false,
              Restarting: false,
              OOMKilled: false,
              Dead: false,
              Pid: 12345,
              ExitCode: 0,
              Error: '',
              StartedAt: '2026-08-16T10:00:05.000000000Z',
              FinishedAt: '0001-01-01T00:00:00Z',
              Health: { Status: 'healthy', FailingStreak: 0 },
            },
            NetworkSettings: { Ports: {} },
          }),
        },
      ],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).inspect(handleFor('c1'))).then((inspected) => {
          expect(inspected).toEqual({ exists: true, running: true, health: 'healthy' })
        }),
    ))

  it('Should_ReportNotExisting_When_TheDaemonAnswers404', () =>
    withDaemon(
      [{ status: 404, body: 'no such container' }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).inspect(handleFor('gone'))).then((inspected) => {
          expect(inspected).toEqual({ exists: false, running: false, health: undefined })
        }),
    ))
})

describe('removeByName', () => {
  it('Should_RemoveByForce_When_TheExactNameResolvesToOneId', () =>
    withDaemon(
      [{ status: 200, body: JSON.stringify([{ Id: 'daemon-id-7' }]) }, { status: 204, body: '' }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).removeByName('rz-deadbeef-7')).then(() => {
          expect(daemon.requests[0]?.url).toContain('/containers/json?all=true&filters=')
          expect(decodeURIComponent(daemon.requests[0]?.url ?? '')).toContain('^/rz-deadbeef-7$')
          expect(daemon.requests[1]?.url).toBe('/containers/daemon-id-7?force=true')
        }),
    ))
})

describe('findRunning', () => {
  it('Should_ReturnTheCallersSpecVerbatim_When_TheRunnerMatchesTheName', () =>
    withDaemon([{ status: 200, body: JSON.stringify([{ Id: 'running-1' }]) }], (daemon) => {
      const spec = baseSpec({ name: 'rz-reuse-abc123abc123' })
      return Effect.runPromise(runtimeFor(daemon.socketPath).findRunning(spec)).then((found) => {
        expect(found).toEqual({ id: 'running-1', spec })
        expect(daemon.requests[0]?.url).not.toContain('all=true') // running-only contract
      })
    }))

  it('Should_ReturnUndefined_When_NoContainerMatches', () =>
    withDaemon(
      [{ status: 200, body: '[]' }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).findRunning(baseSpec())).then((found) => {
          expect(found).toBeUndefined()
        }),
    ))
})

describe('stop (best-effort)', () => {
  it('Should_NotFail_When_TheDaemonRejects', () =>
    withDaemon(
      [{ status: 500, body: 'boom' }],
      (daemon) =>
        Effect.runPromise(runtimeFor(daemon.socketPath).stop(handleFor('c1'))).then(() => {
          expect(daemon.requests[0]?.url).toBe('/containers/c1/stop?t=10')
        }),
    ))
})

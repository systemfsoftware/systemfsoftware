/**
 * Handle tests — the fingerprint kernel, the JSON round-trip, and the
 * by-id reconstruction: docker exec through a scripted daemon, the typed
 * rejection paths (tampered handle, backend mismatch, malformed JSON), and
 * the msb path against a recording runner double with a scripted endpoint
 * probe. No real containers run here (the parity lane owns live by-id
 * integration).
 *
 * Test callbacks are promise-returning (no `async` keyword): this package's
 * effect tsconfig profile bans async function declarations even in tests.
 */
import { Effect, Layer, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import { withDaemon } from '../../backend-docker/__tests__/fake-daemon.js'
import type { CommandRunnerService } from '../../backend-msb/command-runner.js'
import type { ContainerSpec, ExecResult } from '../../model/container-spec.schema.js'
import { RightsizeConfig } from '../../runtime/config.js'
import { Selection } from '../../runtime/selection.workflow.js'
import {
  computeHandleFingerprint,
  ContainerHandle,
  FINGERPRINT_SCHEME,
  fingerprintMatches,
  HandleBackendMismatchError,
  MalformedHandleError,
  parseAgentEndpoint,
  UnreachableMsbAgentError,
} from '../handle.js'
import { _resetRegistryForTests } from '../registry.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** One launched-container portrait, in the `RunningHandle` structural shape. */
const runLike = (
  backend: 'docker' | 'msb',
  id: string,
  overrides: Partial<ContainerSpec> = {},
): {
  readonly backend: 'docker' | 'msb'
  readonly handle: { readonly id: string; readonly spec: ContainerSpec }
  readonly spec: ContainerSpec
} => {
  const spec: ContainerSpec = {
    name: `rz-deadbeef-${id}`,
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
  }
  return { backend, handle: { id, spec }, spec }
}

const dockerLayer = (socketPath: string) =>
  Layer.succeed(Selection, { backend: 'docker', dockerSocketPath: socketPath })

/** The config layer every by-id program needs (the container never dials it in docker tests). */
const configLayer = Layer.succeed(RightsizeConfig, {
  backend: 'auto',
  reaper: 'on',
  cacheDir: '/unused-cache',
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: false,
})

/** One demux stdout frame — the exec/logs stream fixture. */
const stdoutFrame = (payload: string): Buffer => {
  const bytes = Buffer.from(payload)
  const out = Buffer.alloc(8 + bytes.length)
  out[0] = 1 // stdout
  out.writeUInt32BE(bytes.length, 4)
  bytes.copy(out, 8)
  return out
}

/** A recording msb CLI runner — scripted invocations, no subprocess. */
const scriptedRunner = (script: { exec?: Record<string, ExecResult> } = {}): CommandRunnerService & {
  readonly invocations: Array<readonly string[]>
} => {
  const invocations: Array<readonly string[]> = []
  const respond = (args: readonly string[]): ExecResult => {
    invocations.push([...args])
    if (args[0] === 'exec') {
      const tail = args.slice(args.indexOf('--') + 1).join(' ')
      return script.exec?.[tail] ?? { exitCode: 0, stdout: 'ok', stderr: '' }
    }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  return {
    invocations,
    spawn: () => {
      throw new Error('spawn is not used by by-id ops')
    },
    spawnSync: (args) => respond(args),
    invoke: (_args, _timeoutMs) => Effect.succeed(respond(_args)),
    invokePromise: (_args) => Promise.resolve(respond(_args)),
    fetchStdoutExact: (_args) => Effect.succeed(respond(_args).stdout),
  }
}

// ===========================================================================
// Fingerprint kernel
// ===========================================================================

describe('fingerprint kernel (the by-id credential)', () => {
  it('Should_BeDeterministicPerIdentity_When_BackendAndIdRepeat', () => {
    expect(computeHandleFingerprint('docker', 'abc123')).toBe(computeHandleFingerprint('docker', 'abc123'))
    expect(computeHandleFingerprint('msb', 'abc123')).toBe(computeHandleFingerprint('msb', 'abc123'))
  })

  it('Should_Differ_When_BackendOrIdDiffers', () => {
    expect(computeHandleFingerprint('docker', 'abc')).not.toBe(computeHandleFingerprint('docker', 'abd'))
    expect(computeHandleFingerprint('docker', 'abc')).not.toBe(computeHandleFingerprint('msb', 'abc'))
  })

  it('Should_PrefixTheFingerprint_When_TheSchemeIsCurrent', () => {
    expect(computeHandleFingerprint('docker', 'abc')).toMatch(new RegExp(`^${FINGERPRINT_SCHEME}:`))
  })
})

// ===========================================================================
// JSON round-trip
// ===========================================================================

describe('handle JSON round-trip', () => {
  it('Should_SurviveTheJsonRoundTrip_When_TheHandleIsValid', () => {
    _resetRegistryForTests()
    const run = runLike('docker', 'c1')
    const handle = ContainerHandle.fromRunning(run)
    const parsed = ContainerHandle.fromJson(ContainerHandle.toJson(handle))
    expect(Result.isSuccess(parsed)).toBe(true)
    const decoded = Result.getOrThrow(parsed)
    expect(decoded.backend).toBe('docker')
    expect(decoded.containerId).toBe('c1')
    expect(decoded.ports).toEqual([{ hostPort: 49213, guestPort: 6379 }])
    expect(decoded.fingerprint).toBe(handle.fingerprint)
    expect(fingerprintMatches(decoded)).toBe(true)
    expect(decoded.msbAgentEndpoint).toBeUndefined()
  })

  it('Should_CarryTheMsbAgentEndpoint_When_Recorded', () => {
    _resetRegistryForTests()
    const handle = ContainerHandle.fromRunning(runLike('msb', 'rz-box-1'), {
      msbAgentEndpoint: 'http://127.0.0.1:4242',
    })
    const parsed = ContainerHandle.fromJson(ContainerHandle.toJson(handle))
    expect(Result.getOrThrow(parsed).msbAgentEndpoint).toBe('http://127.0.0.1:4242')
  })

  it('Should_RejectTruncatedJson_When_ThePayloadIsMalformed', () => {
    const parsed = ContainerHandle.fromJson('{"backend":"docker","containerId":"c1"')
    expect(Result.isFailure(parsed)).toBe(true)
    expect(Option.isSome(Result.getFailure(parsed))).toBe(true)
    expect(Option.getOrThrow(Result.getFailure(parsed))).toBeInstanceOf(MalformedHandleError)
  })
})

// ===========================================================================
// byId — docker reconstruction (scripted daemon)
// ===========================================================================

describe('byId — docker path', () => {
  it('Should_ExecInAForeignContext_When_TheHandleMatchesTheSelection', () =>
    withDaemon(
      [
        { status: 201, body: JSON.stringify({ Id: 'exec-1' }) }, // exec create
        { status: 200, body: Buffer.concat([stdoutFrame('foreign-ok\n')]) }, // exec start stream
        { status: 200, body: JSON.stringify({ Running: false, ExitCode: 0, Pid: 0 }) }, // exec inspect
      ],
      (daemon) => {
        _resetRegistryForTests()
        const handle = ContainerHandle.fromRunning(runLike('docker', 'c1'))
        const program = ContainerHandle.byId(ContainerHandle.toJson(handle)).pipe(
          Effect.andThen((ops) => ops.exec({ command: ['echo', 'x'], env: [], workingDir: '/work' })),
        )
        const withLayers = Effect.provide(program, Layer.mergeAll(dockerLayer(daemon.socketPath), configLayer))
        return Effect.runPromise(withLayers).then((result) => {
          expect(result).toEqual({ exitCode: 0, stdout: 'foreign-ok\n', stderr: '' })
          // The exec went to the RECORDED container id — no launch, no create.
          expect(daemon.requests[0]?.method).toBe('POST')
          expect(daemon.requests[0]?.url).toBe('/containers/c1/exec')
          expect(daemon.requests[0]?.body).toContain('"/work"')
          expect(daemon.requests).toHaveLength(3) // create + start + inspect only
        })
      },
    ))

  it('Should_RefuseBeforeAnyBackendContact_When_TheFingerprintWasTampered', () =>
    withDaemon([], (daemon) => {
      _resetRegistryForTests()
      const handle = ContainerHandle.fromRunning(runLike('docker', 'c1'))
      const tampered = ContainerHandle.make({
        version: 1,
        backend: 'docker',
        containerId: 'c1',
        ports: handle.ports,
        fingerprint: 'rzh1:000000000000000000000000',
      })
      const program = ContainerHandle.byId(ContainerHandle.toJson(tampered))
      return Effect.runPromise(Effect.provide(program, Layer.mergeAll(dockerLayer(daemon.socketPath), configLayer)))
        .then(() => Promise.reject(new Error('expected HandleBackendMismatchError')))
        .then(
          () => Promise.reject(new Error('unreachable')),
          (error: unknown) => {
            expect(error).toBeInstanceOf(HandleBackendMismatchError)
            expect((error as HandleBackendMismatchError).actual).toBe('fingerprint-mismatch')
            expect(daemon.requests).toHaveLength(0) // the refusal happens before ANY backend call
            return undefined
          },
        )
    }))

  it('Should_FailWithTypedMismatch_When_TheSelectionIsNotDocker', () => {
    _resetRegistryForTests()
    const handle = ContainerHandle.fromRunning(runLike('docker', 'c1'))
    const program = ContainerHandle.byId(ContainerHandle.toJson(handle))
    const msbSelection = Layer.succeed(Selection, { backend: 'msb', dockerSocketPath: undefined })
    return Effect.runPromise(Effect.provide(program, Layer.mergeAll(msbSelection, configLayer)))
      .then(() => Promise.reject(new Error('expected HandleBackendMismatchError')))
      .then(
        () => Promise.reject(new Error('unreachable')),
        (error: unknown) => {
          expect(error).toBeInstanceOf(HandleBackendMismatchError)
          expect((error as HandleBackendMismatchError).actual).toBe('msb')
          expect((error as HandleBackendMismatchError).backend).toBe('docker')
          return undefined
        },
      )
  })
})

// ===========================================================================
// byId — msb path (recording runner + scripted endpoint probe)
// ===========================================================================

describe('byId — msb path', () => {
  it('Should_FailWithUnreachableAgent_When_TheRecordedEndpointDoesNotAnswer', () => {
    _resetRegistryForTests()
    const handle = ContainerHandle.fromRunning(runLike('msb', 'rz-box-1'), {
      msbAgentEndpoint: 'http://127.0.0.1:4242',
    })
    const probe = () => Effect.succeed(false)
    const program = ContainerHandle.byId(ContainerHandle.toJson(handle), { msb: { probeEndpoint: probe } })
    return Effect.runPromise(Effect.provide(program, Layer.mergeAll(dockerLayer('/unused.sock'), configLayer)))
      .then(() => Promise.reject(new Error('expected UnreachableMsbAgentError')))
      .then(
        () => Promise.reject(new Error('unreachable')),
        (error: unknown) => {
          expect(error).toBeInstanceOf(UnreachableMsbAgentError)
          const typed = error as UnreachableMsbAgentError
          expect(typed.endpoint).toBe('http://127.0.0.1:4242')
          expect(typed.backend).toBe('msb')
          return undefined
        },
      )
  })

  it('Should_ExecThroughTheRecordedRunner_When_TheEndpointProbeAnswers', () => {
    _resetRegistryForTests()
    const runner = scriptedRunner({ exec: { 'echo hi': { exitCode: 0, stdout: 'hi\n', stderr: '' } } })
    const handle = ContainerHandle.fromRunning(runLike('msb', 'rz-box-7'), {
      msbAgentEndpoint: 'http://127.0.0.1:8123',
    })
    const probe = () => Effect.succeed(true)
    const program = ContainerHandle.byId(ContainerHandle.toJson(handle), { msb: { runner, probeEndpoint: probe } })
    return Effect.runPromise(Effect.provide(program, Layer.mergeAll(dockerLayer('/unused.sock'), configLayer))).then((
      ops,
    ) =>
      Effect.runPromise(ops.exec({ command: ['echo', 'hi'], env: [] })).then((result) => {
        expect(result).toEqual({ exitCode: 0, stdout: 'hi\n', stderr: '' })
        // msb exec is agent-routed by NAME — the recorded argv names the sandbox.
        expect(runner.invocations.filter((args) => args[0] === 'exec')).toEqual([[
          'exec',
          'rz-box-7',
          '--',
          'echo',
          'hi',
        ]])
      })
    )
  })

  it('Should_ResolveMappedPortsFromRecordedData_When_HandleWasReconstructed', () => {
    _resetRegistryForTests()
    const runner = scriptedRunner()
    const handle = ContainerHandle.fromRunning(runLike('docker', 'c1'))
    const program = ContainerHandle.byId(ContainerHandle.toJson(handle), { msb: { runner } })
    return Effect.runPromise(Effect.provide(program, Layer.mergeAll(dockerLayer('/unused.sock'), configLayer))).then(
      (ops) => {
        expect(ops.getMappedPort(6379)).toBe(49213)
        expect(ops.getMappedPort(9999)).toBeUndefined()
        expect(ops.getHost()).toBe('127.0.0.1')
      },
    )
  })
})

// ===========================================================================
// parseAgentEndpoint — the probe grammar
// ===========================================================================

describe('parseAgentEndpoint', () => {
  it('Should_ParseTcpWithOptionalScheme_When_HostAndPortArePresent', () => {
    expect(parseAgentEndpoint('http://127.0.0.1:8123')).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 8123 })
    expect(parseAgentEndpoint('127.0.0.1:4242')).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 4242 })
    expect(parseAgentEndpoint(':4242')).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 4242 })
  })

  it('Should_ParseAUnixSocket_When_BareOrPrefixed', () => {
    expect(parseAgentEndpoint('/run/msb/agent.sock')).toEqual({ kind: 'unix', sockPath: '/run/msb/agent.sock' })
    expect(parseAgentEndpoint('unix:///run/msb/agent.sock')).toEqual({ kind: 'unix', sockPath: '/run/msb/agent.sock' })
  })

  it('Should_ReportUnprobeable_When_TheEndpointIsANamedPipeOrGarbage', () => {
    expect(parseAgentEndpoint('\\\\.\\pipe\\msb-agent-x')).toBeUndefined()
    expect(parseAgentEndpoint('not-a-port')).toBeUndefined()
    expect(parseAgentEndpoint('')).toBeUndefined()
  })
})

/**
 * ContainerHandle.byId/fromJson contracts (R15, KTD7) — the durable,
 * JSON-threadable identity surface: a minted handle serializes, parses,
 * and reconstructs the same container through a scripted backend; and a
 * malformed payload, an unknown backend tag, a swapped backend, or a
 * tampered port map are each refused with the typed error BEFORE any
 * backend contact (the rzh2 fingerprint is the reconstruction credential).
 *
 * The docker reconstruction composes the real unix-socket client over the
 * resolved `Selection` — construction is pure (it holds a socket path), so
 * the docker round-trip asserts the surface byId promises from the handle
 * data alone (container id, the recorded port map, the loopback host,
 * backend identity) without dialing a daemon. The msb path has the
 * documented `ByIdOptions.msb.runner` seam, which the round-trip drives
 * end-to-end through a scripted CLI runner and asserts the recorded argv
 * actually reaches the runner.
 */
import { Effect, Layer, Result, Schema as S } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import type { CommandRunnerService } from '../../backend-msb/command-runner.js'
import type { ContainerSpec } from '../../model/container-spec.js'
import { newContainerSpec } from '../../model/spec-combinators.js'
import { RightsizeConfig } from '../../runtime/config.js'
import type { RightsizeConfigService } from '../../runtime/config.js'
import { Selection } from '../../runtime/selection.workflow.js'
import { ContainerHandle, HandleBackendMismatchError, type HandleOps, MalformedHandleError } from '../handle.js'
import { _resetRegistryForTests, isLiveContainer, listLiveContainers } from '../registry.js'

/** A settled spec whose port map is fully allocated (guest 6379 → host 42210). */
const settledSpec = (): ContainerSpec => ({
  ...newContainerSpec('redis:8.2-alpine', 'rz-handle-test'),
  ports: [{ guestPort: 6379, hostPort: 42210 }],
})

/** Every byId test runs under a docker selection + an inert config: both services the reconstruction reads. */
const byIdEnv = (): Layer.Layer<Selection | RightsizeConfig> =>
  Layer.mergeAll(
    Layer.succeed(Selection, {
      backend: 'docker',
      dockerSocketPath: '/tmp/rightsize-handle-test.sock',
    }),
    Layer.succeed(
      RightsizeConfig,
      {
        backend: 'auto',
        reaper: 'off',
        cacheDir: '/tmp/rightsize-handle-test-cache',
        reuse: false,
        msbPath: undefined,
        msbSkipDownload: true,
      } satisfies RightsizeConfigService,
    ),
  )

/** A scripted msb CLI runner: records every invocation's argv, answers success. */
const scriptedRunner = (recorded: string[]): CommandRunnerService => ({
  invoke: (args) => {
    recorded.push(...args)
    return Effect.succeed({ exitCode: 0, stdout: 'root\n', stderr: '' })
  },
  fetchStdoutExact: (args) => {
    recorded.push(...args)
    return Effect.succeed('')
  },
  spawn: () =>
    Effect.succeed({
      exited: Promise.resolve(0),
      stdout: { resume: () => {} } as unknown as NodeJS.ReadableStream,
      stderr: { resume: () => {} } as unknown as NodeJS.ReadableStream,
      stdin: { end: () => {} } as unknown as NodeJS.WritableStream,
      kill: () => {},
    }),
  spawnSync: () => {},
})

/** One byId attempt's outcome, mapped from the typed channels so every failure is observable as data. */
type ByIdRun = { readonly _tag: 'ok'; readonly ops: HandleOps } | { readonly _tag: 'fail'; readonly failure: unknown }

const byIdOutcome = (handleJson: string, options: Parameters<typeof ContainerHandle.byId>[1] = {}): Promise<ByIdRun> =>
  Effect.runPromise(
    Effect.match(ContainerHandle.byId(handleJson, options).pipe(Effect.provide(byIdEnv())), {
      onSuccess: (ops): { readonly _tag: 'ok'; readonly ops: HandleOps } => ({ _tag: 'ok', ops }),
      onFailure: (failure): { readonly _tag: 'fail'; readonly failure: unknown } => ({ _tag: 'fail', failure }),
    }),
  )

/** The success arm, or a loud test failure — guards before unconditional expects (no conditional expect). */
const opsOrThrow = (outcome: ByIdRun): HandleOps => {
  if (outcome._tag === 'fail') {
    throw new Error(`byId failed unexpectedly: ${JSON.stringify(outcome.failure)}`)
  }
  return outcome.ops
}

/** The failure arm, or a loud test failure. */
const failureOrThrow = (outcome: ByIdRun): unknown => {
  if (outcome._tag === 'ok') {
    throw new Error('byId resolved — expected a typed rejection')
  }
  return outcome.failure
}

/** The mismatch error, narrowed through its schema — or a loud test failure when some other error surfaced. */
const mismatchOrThrow = (failure: unknown): HandleBackendMismatchError => {
  if (!S.is(HandleBackendMismatchError)(failure)) {
    throw new Error(`expected HandleBackendMismatchError, got ${JSON.stringify(failure)}`)
  }
  return failure
}

/** The decoded handle, or a loud failure when fromJson refused it. */
const parsedOrThrow = (parsed: Result.Result<ContainerHandle, MalformedHandleError>): ContainerHandle => {
  if (Result.isFailure(parsed)) {
    throw new Error(`handle JSON refused: ${parsed.failure.message}`)
  }
  return parsed.success
}

/** The decode failure, or a loud failure when fromJson succeeded. */
const parseFailureOrThrow = (parsed: Result.Result<ContainerHandle, MalformedHandleError>): MalformedHandleError => {
  if (Result.isSuccess(parsed)) {
    throw new Error('handle JSON decoded — expected MalformedHandleError')
  }
  return parsed.failure
}

/** The handle JSON of a minted docker handle with the given container id. */
const dockerHandleJson = (containerId: string): string => {
  const spec = settledSpec()
  const handle = ContainerHandle.fromRunning({
    backend: 'docker',
    handle: { id: containerId, spec },
    spec,
  })
  return ContainerHandle.toJson(handle)
}

afterEach(() => {
  _resetRegistryForTests()
})

describe('ContainerHandle byId', () => {
  it('Should_ResolveTheSameDockerContainer_When_ItsJsonRoundTripsThroughFromJsonAndById', () => {
    const json = dockerHandleJson('docker-cid-1')
    const parsed = ContainerHandle.fromJson(json)
    expect(parsedOrThrow(parsed).containerId).toBe('docker-cid-1')
    expect(parsedOrThrow(parsed).ports).toEqual([{ guestPort: 6379, hostPort: 42210 }])
    return byIdOutcome(json).then((outcome) => {
      const ops = opsOrThrow(outcome)
      expect(ops.containerId).toBe('docker-cid-1')
      expect(ops.backend).toBe('docker')
      expect(ops.getHost()).toBe('127.0.0.1')
      expect(ops.getMappedPort(6379)).toBe(42210)
      expect(ops.getMappedPort(9999)).toBeUndefined()
      expect(ops.handle.containerId).toBe('docker-cid-1')
      expect(ops.handle.fingerprint).toMatch(/^rzh2:[0-9a-f]{24}$/)
    })
  })

  it('Should_DriveTheScriptedRunner_When_AnMsbHandleRoundTripsThroughById', () => {
    const recorded: string[] = []
    const spec = settledSpec()
    const handle = ContainerHandle.fromRunning(
      { backend: 'msb', handle: { id: 'sandbox-a', spec }, spec },
      { msbAgentEndpoint: 'unix:///tmp/rightsize-agent.sock' },
    )
    const json = ContainerHandle.toJson(handle)
    return byIdOutcome(json, {
      msb: {
        runner: scriptedRunner(recorded),
        probeEndpoint: () => Effect.succeed(true),
      },
    })
      .then((outcome) => {
        const ops = opsOrThrow(outcome)
        // The reconstructed msb surface is executable — drive one one-shot
        // through it and observe both the verdict and the recorded argv.
        return Effect.runPromise(ops.execCommand('whoami')).then((exec) => ({ ops, exec, recorded }))
      })
      .then(({ ops, exec, recorded: seen }) => {
        expect(ops.backend).toBe('msb')
        expect(ops.getMappedPort(6379)).toBe(42210)
        expect(exec.exitCode).toBe(0)
        expect(exec.stdout).toBe('root\n')
        // The by-id contract's whole point: the container id travels in the
        // handle data alone and reaches the scripted backend verbatim.
        expect(seen.join(' ')).toContain('exec sandbox-a -- whoami')
      })
  })

  it('Should_FailWithMalformedHandleError_When_TheJsonDoesNotParse', () => {
    const parsed = ContainerHandle.fromJson('{not json')
    expect(parseFailureOrThrow(parsed)._tag).toBe('MalformedHandleError')
    expect(parseFailureOrThrow(parsed).message).toContain('did not parse')
    return byIdOutcome('{not json').then((outcome) => {
      const failure = failureOrThrow(outcome)
      expect(S.is(MalformedHandleError)(failure)).toBe(true)
    })
  })

  it('Should_FailWithMalformedHandleError_When_TheBackendTagIsUnknown', () => {
    const json = JSON.parse(dockerHandleJson('docker-cid-2')) as Record<string, unknown>
    json['backend'] = 'k8s'
    const tampered = JSON.stringify(json)
    const parsed = ContainerHandle.fromJson(tampered)
    expect(parseFailureOrThrow(parsed)._tag).toBe('MalformedHandleError')
    return byIdOutcome(tampered).then((outcome) => {
      const failure = failureOrThrow(outcome)
      expect(S.is(MalformedHandleError)(failure)).toBe(true)
    })
  })

  it('Should_FailWithBackendMismatch_When_TheBackendIsSwappedWithoutRefingerprinting', () => {
    const json = JSON.parse(dockerHandleJson('docker-cid-1')) as { backend: string }
    json['backend'] = 'msb'
    const tampered = JSON.stringify(json)
    // The swapped tag decodes fine — the rzh2 fingerprint over (backend, id,
    // ports, agent endpoint) is what refuses it, before any backend contact.
    expect(Result.isSuccess(ContainerHandle.fromJson(tampered))).toBe(true)
    return byIdOutcome(tampered).then((outcome) => {
      const failure = failureOrThrow(outcome)
      expect(S.is(HandleBackendMismatchError)(failure)).toBe(true)
      const mismatch = mismatchOrThrow(failure)
      expect(mismatch.actual).toBe('fingerprint-mismatch')
      expect(mismatch.backend).toBe('msb')
      expect(mismatch.containerId).toBe('docker-cid-1')
    })
  })

  it('Should_FailWithBackendMismatch_When_TheHandlePortMapIsTampered', () => {
    const json = JSON.parse(dockerHandleJson('docker-cid-1')) as {
      ports: Array<{ guestPort: number; hostPort: number }>
    }
    json['ports'] = [{ guestPort: 6379, hostPort: 49152 }]
    const tampered = JSON.stringify(json)
    return byIdOutcome(tampered).then((outcome) => {
      const failure = failureOrThrow(outcome)
      expect(S.is(HandleBackendMismatchError)(failure)).toBe(true)
      const mismatch = mismatchOrThrow(failure)
      expect(mismatch.actual).toBe('fingerprint-mismatch')
      // The typed error names the tampered handle rather than silently
      // re-dialing under the forged port map.
      expect(mismatch.reason).toContain('tampered')
    })
  })

  it('Should_MintARzh2Handle_When_FromRunningRecordsTheLiveRegistryRow', () => {
    const spec = settledSpec()
    const handle = ContainerHandle.fromRunning({
      backend: 'docker',
      handle: { id: 'docker-cid-5', spec },
      spec,
    })
    expect(handle.fingerprint).toMatch(/^rzh2:[0-9a-f]{24}$/)
    expect(isLiveContainer('docker', 'docker-cid-5')).toBe(true)
    expect(listLiveContainers().some((row) => row.id === 'docker-cid-5')).toBe(true)
  })
})

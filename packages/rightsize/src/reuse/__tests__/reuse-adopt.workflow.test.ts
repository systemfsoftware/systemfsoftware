/**
 * The reuse-adopt tests (R14) — two altitudes:
 *
 * 1. the pre-I/O `Workflow.make` decision matrix — double-opt-in refusal,
 *    the reuse-incompatible shapes (network/checkpoint), and the
 *    registry/readiness state table (pure: no I/O, no services);
 * 2. the seam behaviors — the full adopt `Cell` over recording doubles
 *    (no sockets — the readiness re-verification is vacuously ready or
 *    scripted; reaper: off), covering the double-opt-in refusal with zero
 *    backend calls, adopt-via-findRunning returning the spec verbatim,
 *    stale cleanup on a dead entry, and the wait-gate refusal.
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Effect, Layer, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import { makeRecordingRuntime } from '../../../__tests__/helpers.js'
import type { ContainerSpec } from '../../model/container-spec.schema.js'
import { ReuseFromCheckpointError, ReuseWithNetworkError } from '../../model/errors.js'
import { withReuse } from '../../model/spec-combinators.js'
import { RightsizeConfig } from '../../runtime/config.js'
import type { SandboxHandle, SandboxRuntimeService } from '../../runtime/runtime.js'
import { SandboxRuntime } from '../../runtime/runtime.js'
import type { WaitOptions } from '../../wait/interpreter.js'
import { adoptRunningSeam } from '../adopt.js'
import { decideReuseAdopt, type ReuseAdoptCommand, type ReuseAdoptDecision } from '../adopt.workflow.js'
import { reuseIdentityHash, reuseIdentityOf, reuseName } from '../hash.kernel.js'
import { readRegistry, type ReuseRegistryEntry, writeRegistryAtomic } from '../registry.js'

const HANDLE: SandboxHandle = {
  id: 'cid-running-1',
  spec: {
    name: 'rz-reuse-abcdef123456',
    image: 'redis:8.6-alpine',
    env: [],
    ports: [],
    mounts: [],
    aliases: [],
    runId: '',
    keepAlive: true,
    networkDisabled: false,
    requireIsolation: false,
    waitStrategy: { _tag: 'ForPort' },
  },
}

const command = (overrides: Partial<Omit<ReuseAdoptCommand, '_tag'>> = {}): ReuseAdoptCommand => ({
  _tag: 'DecideReuseAdopt',
  reuseOptIn: true,
  networkId: undefined,
  checkpointRef: undefined,
  registry: { kind: 'missing' },
  running: undefined,
  name: 'rz-reuse-abcdef123456',
  cacheDir: '/tmp/rightsize-test-cache',
  hash: 'abcdef1234567890',
  ...overrides,
})

const decided = (input: ReuseAdoptCommand): ReuseAdoptDecision => {
  const outcome = decideReuseAdopt(input)
  expect(Result.isFailure(outcome)).toBe(false)
  return Result.getOrThrow(outcome)
}

describe('decideReuseAdopt — the double opt-in gate', () => {
  it('Should_IgnoreTheAdoption_When_ReuseIsNotOptedIn', () => {
    expect(decided(command({ reuseOptIn: false }))._tag).toBe('Ignored')
  })

  it('Should_Adopt_When_TheRegistryFoundAndTheContainerIsRunning', () => {
    const outcome = decideReuseAdopt(command({
      registry: {
        kind: 'found',
        entry: {
          name: 'rz-reuse-abcdef123456',
          image: 'redis:8.6-alpine',
          ports: { 6379: 41173 },
          createdIso: '2026-01-01T00:00:00.000Z',
          backend: 'docker',
        },
      },
      running: HANDLE,
    }))
    expect(Result.isSuccess(outcome)).toBe(true)
    const adopt = Result.getOrThrow(outcome)
    expect(adopt).toEqual({
      _tag: 'Adopt',
      handle: HANDLE,
      cacheDir: '/tmp/rightsize-test-cache',
      hash: 'abcdef1234567890',
    })
  })
})

describe('decideReuseAdopt — the reuse-incompatible spec gates (pre-I/O, zero runtime calls)', () => {
  it('Should_FailWithNetwork_When_TheSpecJoinsANetworkUnderOptIn', () => {
    const decision = decideReuseAdopt(command({ networkId: 'rz-net-1' }))
    expect(Result.isFailure(decision)).toBe(true)
    expect(Option.getOrThrow(Result.getFailure(decision))).toBeInstanceOf(ReuseWithNetworkError)
  })

  it('Should_FailWithCheckpoint_When_TheSpecCarriesACheckpointRefUnderOptIn', () => {
    const decision = decideReuseAdopt(command({ checkpointRef: 'rightsize/checkpoint:abc' }))
    expect(Result.isFailure(decision)).toBe(true)
    expect(Option.getOrThrow(Result.getFailure(decision))).toBeInstanceOf(ReuseFromCheckpointError)
  })

  it('Should_NeverReachTheStateTable_When_TheOptInIsOff', () => {
    expect(decided(command({ reuseOptIn: false, networkId: 'rz-net-1' }))._tag).toBe('Ignored')
  })
})

describe('decideReuseAdopt — the registry/readiness state table', () => {
  it('Should_CleanTheSandboxAndEntry_When_TheEntryExistsButNothingIsRunning', () => {
    expect(decided(command({
      registry: {
        kind: 'found',
        entry: {
          name: 'rz-reuse-abcdef123456',
          image: 'redis:8.6-alpine',
          ports: {},
          createdIso: '2026-01-01T00:00:00.000Z',
          backend: 'docker',
        },
      },
      running: undefined,
    }))).toEqual({
      _tag: 'Cleanup',
      name: 'rz-reuse-abcdef123456',
      cacheDir: '/tmp/rightsize-test-cache',
      hash: 'abcdef1234567890',
      removeByName: true,
      removeRegistry: true,
    })
  })

  it('Should_RemoveTheNameOnly_When_NoEntryExistsButTheNameIsRunning', () => {
    const value = decided(command({ registry: { kind: 'missing' }, running: HANDLE }))
    expect(value._tag).toBe('Cleanup')
    expect(value).toMatchObject({ removeByName: true, removeRegistry: false })
  })

  it('Should_BeFresh_When_NoEntryExistsAndNothingIsRunning', () => {
    expect(decided(command({ registry: { kind: 'missing' }, running: undefined }))).toEqual({ _tag: 'Fresh' })
  })

  it('Should_CleanTheSandboxAndEntry_When_TheEntryIsCorruptEvenIfNothingRuns', () => {
    const value = decided(command({ registry: { kind: 'corrupt' }, running: undefined }))
    expect(value).toMatchObject({ _tag: 'Cleanup', removeByName: true, removeRegistry: true })
  })
})

// =============================================================================
// The seam behaviors — one withReuse spec, a recorded runtime, a real tmp
// registry; the readiness re-verification is vacuously ready when the spec
// has no ports.
// =============================================================================

/** A `withReuse` spec with no exposed ports — adoption's readiness re-verification is vacuously ready. */
const reuseSpec = (): ContainerSpec =>
  withReuse({
    name: 'rz-user',
    image: 'redis:8.6-alpine',
    env: [['A', '1']],
    ports: [],
    mounts: [],
    aliases: [],
    runId: '',
    keepAlive: false,
    networkDisabled: false,
    requireIsolation: false,
    waitStrategy: { _tag: 'ForPort' },
  })

/** The registry key + deterministic name the seam will compute for `spec`. */
const identityOf = (spec: ContainerSpec): string => reuseIdentityHash(reuseIdentityOf(spec), [])

/** The recording runtime double — findRunning/removeByName scripted; the rest inert. */
interface AdoptDouble {
  readonly findRunningCalls: Array<{ readonly name: string }>
  readonly removeByNameCalls: string[]
  readonly service: SandboxRuntimeService
}

const adoptDouble = (running: ((spec: ContainerSpec) => SandboxHandle | undefined) | undefined): AdoptDouble => {
  const findRunningCalls: Array<{ readonly name: string }> = []
  const removeByNameCalls: string[] = []
  const base = makeRecordingRuntime()
  base.service.findRunning = (spec) => {
    findRunningCalls.push({ name: spec.name })
    return Effect.succeed(running === undefined ? undefined : running(spec))
  }
  base.service.removeByName = (name) => {
    removeByNameCalls.push(name)
    return Effect.void
  }
  return { findRunningCalls, removeByNameCalls, service: base.service }
}

let dirSequence = 0

const freshDir = (): Promise<string> =>
  fsp.mkdtemp(path.join(os.tmpdir(), `rightsize-reuse-workflow-${++dirSequence}-`))

const runSeam = (
  cacheDir: string,
  double: AdoptDouble,
  spec: ContainerSpec,
  optIn: boolean,
  wait: WaitOptions = {},
): Promise<SandboxHandle | undefined> =>
  Effect.runPromise(
    adoptRunningSeam({ cacheDir, wait }).pipe(
      Effect.flatMap((seam) => seam(spec)),
      Effect.provide(Layer.mergeAll(
        Layer.succeed(SandboxRuntime, double.service),
        Layer.succeed(RightsizeConfig, {
          backend: 'auto',
          reaper: 'off',
          cacheDir,
          reuse: optIn,
          msbPath: undefined,
          msbSkipDownload: false,
        }),
      )),
    ),
  )

const seed = (cacheDir: string, spec: ContainerSpec, ports: Record<string, number>, hash: string): Promise<string> => {
  const name = reuseName(hash)
  const entry: ReuseRegistryEntry = {
    name,
    image: spec.image,
    ports,
    createdIso: '2026-01-01T00:00:00.000Z',
    backend: 'docker',
  }
  return Effect.runPromise(writeRegistryAtomic(cacheDir, hash, entry)).then(() => name)
}

describe('the reuse seam — double opt-in (zero backend calls when refused)', () => {
  it('Should_RefuseToAdopt_When_TheSpecCarriesNoReuseMarker', () =>
    freshDir().then((cacheDir) => {
      const double = adoptDouble(undefined)
      return runSeam(cacheDir, double, { ...reuseSpec(), keepAlive: false }, true).then((adopted) => {
        expect(adopted).toBeUndefined()
        expect(double.findRunningCalls).toEqual([])
        expect(double.removeByNameCalls).toEqual([])
      })
    }))

  it('Should_RefuseToAdopt_When_TheEnvOptInIsMissing', () =>
    freshDir().then((cacheDir) => {
      const double = adoptDouble(undefined)
      return runSeam(cacheDir, double, reuseSpec(), false).then((adopted) => {
        expect(adopted).toBeUndefined()
        expect(double.findRunningCalls).toEqual([])
        expect(double.removeByNameCalls).toEqual([])
      })
    }))

  it('Should_RefuseToAdopt_When_TheSpecJoinsANetworkUnderOptIn', () =>
    freshDir().then((cacheDir) => {
      const double = adoptDouble(undefined)
      return runSeam(cacheDir, double, { ...reuseSpec(), networkId: 'rz-net-1' }, true).then((adopted) => {
        expect(adopted).toBeUndefined()
        expect(double.findRunningCalls).toEqual([])
        expect(double.removeByNameCalls).toEqual([])
      })
    }))
})

describe('the reuse seam — adopt via findRunning', () => {
  it('Should_AdoptTheRunningContainer_When_TheRegistryAndLivenessAgree', () =>
    freshDir().then((cacheDir) => {
      const spec = reuseSpec()
      const hash = identityOf(spec)
      return seed(cacheDir, spec, {}, hash).then((name) => {
        const double = adoptDouble((candidate) => ({ id: 'cid-1', spec: candidate }))
        return runSeam(cacheDir, double, spec, true).then((adopted) => {
          expect(adopted?.id).toBe('cid-1')
          // The find-running probe carried the deterministic reuse name and
          // the returned handle's spec is the caller's spec verbatim.
          expect(double.findRunningCalls[0]?.name).toBe(name)
          // The returned handle's spec carries the probe spec's fields —
          // never re-derived from backend inspection (the verbatim contract).
          expect(adopted?.spec.name).toBe(name)
          expect(adopted?.spec.image).toBe(spec.image)
          expect(adopted?.spec.env).toEqual(spec.env)
          expect(adopted?.spec.keepAlive).toBe(true)
          expect(double.removeByNameCalls).toEqual([])
        })
      })
    }))

  it('Should_CleanTheStaleSandboxAndEntry_When_TheEntryExistsButNothingRuns', () =>
    freshDir().then((cacheDir) => {
      const spec = reuseSpec()
      const hash = identityOf(spec)
      return seed(cacheDir, spec, {}, hash).then((name) => {
        const double = adoptDouble(undefined)
        return runSeam(cacheDir, double, spec, true).then((adopted) => {
          expect(adopted).toBeUndefined()
          expect(double.removeByNameCalls).toEqual([name])
          return Effect.runPromise(readRegistry(cacheDir, hash)).then((outcome) => {
            expect(outcome.kind).toBe('missing')
          })
        })
      })
    }))

  it('Should_CleanAndRefuseAdoption_When_TheReadinessReVerificationFails', () =>
    freshDir().then((cacheDir) => {
      const spec = { ...reuseSpec(), ports: [{ guestPort: 6379, hostPort: 41173 }] }
      const hash = identityOf(spec)
      return seed(cacheDir, spec, { 6379: 41173 }, hash).then((name) => {
        const double = adoptDouble((candidate) => ({ id: 'cid-1', spec: candidate }))
        return runSeam(
          cacheDir,
          double,
          spec,
          true,
          { startupTimeoutMs: 300, portProbe: () => Effect.succeed(false) },
        ).then((adopted) => {
          expect(adopted).toBeUndefined()
          expect(double.removeByNameCalls).toEqual([name])
        })
      })
    }))
})

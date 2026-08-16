/**
 * `layerMsb` composition tests — the microsandbox backend Layer driven with
 * a `RightsizeConfig` double (test seam): provisioning resolves over a fake
 * executable `msb` path, the layer acquires the four capability Tags, and
 * the backend release (the exact `close` the layer's scope finalizer runs)
 * stops and removes an owned sandbox. The release test drives
 * `createMsbBackend` with a scripted runner double — the same
 * layerMsb-acquire path minus the real child-process seam — so the whole
 * lifecycle shape (R5) is observable with no microVM and no network.
 *
 * The RC models a `yield* Tag` requirement with the class key while the
 * composed layer's service set is declared with `typeof Tag`; the two do
 * not unify, so the run seam normalizes them with a documented cast.
 *
 * No `async` test functions (repo ban): every test returns a promise chain.
 */
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PassThrough } from 'node:stream'

import { Effect, Layer, ManagedRuntime } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import type { ContainerSpec } from '../../model/container-spec.schema.js'
import { RightsizeConfig, type RightsizeConfigService } from '../../runtime/config.js'
import {
  CheckpointStore,
  type CheckpointStoreService,
  ImageRegistry,
  type ImageRegistryService,
  SandboxRuntime,
  type SandboxRuntimeService,
  VirtualNetworks,
  type VirtualNetworksService,
} from '../../runtime/runtime.js'
import type { CommandRunnerService } from '../command-runner.js'
import { createMsbBackend, layerMsb } from '../index.js'
import { defaultMsbRuntimeOptions, type MsbRuntimeOptions } from '../runtime.adapter.js'

const spec = (): ContainerSpec => ({
  name: 'rz-layer-1',
  image: 'fake:1',
  env: [],
  ports: [],
  mounts: [],
  aliases: [],
  runId: 'test',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
})

const configWith = (msbPath: string | undefined): RightsizeConfigService => ({
  backend: 'msb',
  reaper: 'off',
  cacheDir: undefined,
  reuse: false,
  msbPath,
  msbSkipDownload: false,
})

/** Runtime options shrunken so the fake boot answers immediately. */
const quickRuntime: MsbRuntimeOptions = {
  ...defaultMsbRuntimeOptions(),
  readinessPollMs: 1,
}

function failureMessage(failure: unknown): string {
  if (typeof failure === 'object' && failure !== null && 'message' in failure) {
    const message: unknown = failure.message
    if (typeof message === 'string') {
      return message
    }
  }
  return '<non-string rejection>'
}

const tempDirs: string[] = []
afterEach(() => {
  const dirs = tempDirs.splice(0)
  return Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)))
})

function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix)).then((dir) => {
    tempDirs.push(dir)
    return dir
  })
}

/** A scripted `msb` executable path: `provisionMsb` only probes it, so an empty executable file suffices. */
function installFakeMsb(dir: string): Promise<string> {
  const fakeMsb = join(dir, 'fake-msb')
  return writeFile(fakeMsb, '#!/usr/bin/env bash\nexit 0\n').then(() => chmod(fakeMsb, 0o755)).then(() => fakeMsb)
}

/** The runtime seam normalized to `Effect.Effect<A, E, never>` programs (see module doc). */
interface BackendRuntime {
  runPromise: <A, E>(program: Effect.Effect<A, E, never>) => Promise<A>
  dispose: () => Promise<void>
}

describe('layerMsb (composition through the real provisioner + runner)', () => {
  it('Should_BuildTheBackendAcquireFourServices_When_ProvidedTheRightsizeConfig', () =>
    makeTempDir('rz-layer-').then((dir) =>
      installFakeMsb(dir).then((fakeMsb) => {
        const layer = Layer.provide(Layer.succeed(RightsizeConfig, configWith(fakeMsb)))(
          layerMsb({ runtime: quickRuntime }),
        )
        const runtime = ManagedRuntime.make(layer) as unknown as BackendRuntime
        const acquire = Effect.gen(function*() {
          const rt = yield* SandboxRuntime
          const networks = yield* VirtualNetworks
          const checkpoints = yield* CheckpointStore
          const images = yield* ImageRegistry
          return { rt, networks, checkpoints, images }
        }) as unknown as Effect.Effect<
          {
            rt: SandboxRuntimeService
            networks: VirtualNetworksService
            checkpoints: CheckpointStoreService
            images: ImageRegistryService
          },
          never,
          never
        >
        return runtime.runPromise(acquire).then((services) => {
          expect(services.rt.name).toBe('msb')
          expect(services.rt.capabilities).toEqual({
            hardwareIsolated: true,
            checkpoint: true,
            checkpointRestartsWorkload: true,
            supportsNativeNetworks: false,
            healthInspection: false,
          })
          // The three satellite Tags exist with their declared surfaces.
          expect(services.networks).toBeDefined()
          expect(services.checkpoints).toBeDefined()
          expect(Object.keys(services.images)).toEqual(expect.arrayContaining(['pull', 'inspect', 'importImage']))
        }).finally(() => runtime.dispose())
      })
    ))

  it('Should_StopAndRemoveTheOwnedSandbox_When_TheLayerScopeCloses', () => {
    const timeline: string[] = []
    const runningJson = `[${JSON.stringify({ name: 'rz-layer-1', status: 'Running' })}]`
    const runner: CommandRunnerService = {
      invoke: (args) =>
        Effect.sync(() => {
          timeline.push(args.join(' '))
          return args[0] === 'ls'
            ? { exitCode: 0, stdout: runningJson, stderr: '' }
            : { exitCode: 0, stdout: '', stderr: '' }
        }),
      invokePromise: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
      fetchStdoutExact: (args) =>
        Effect.sync(() => {
          timeline.push(args.join(' '))
          return ''
        }),
      // The attached boot child stays alive; ls answers Running.
      spawn: () =>
        Effect.sync(() => {
          const stdout = new PassThrough()
          const stderr = new PassThrough()
          const { promise, resolve } = Promise.withResolvers<number | null>()
          return {
            exited: promise,
            stdout,
            stderr,
            stdin: new PassThrough(),
            kill: () => {
              stdout.end()
              stderr.end()
              resolve(null)
            },
          }
        }),
      spawnSync: () => {},
    }
    const backend = createMsbBackend(runner, { ...defaultMsbRuntimeOptions(), readinessPollMs: 1 })
    // The layer release runs exactly `backend.close`: the owned sandbox is
    // stopped then removed; nothing remains in the own-run set.
    const program = Effect.gen(function*() {
      const rt = yield* Effect.succeed(backend.open.SandboxRuntime)
      const handle = yield* rt.create(spec())
      yield* rt.start(handle)
      return handle
    })
    return Effect.runPromise(program)
      .then(() => Effect.runPromise(backend.close))
      .then(() => {
        expect(timeline).toEqual(['ls --format json', 'stop rz-layer-1', 'rm rz-layer-1'])
      })
  })

  it('Should_FailProvisioning_When_TheConfiguredMsbPathIsNotExecutable', () => {
    const runtime = ManagedRuntime.make(
      Layer.provide(Layer.succeed(RightsizeConfig, configWith('/nonexistent/msb')))(layerMsb()),
    ) as unknown as BackendRuntime
    const program = Effect.gen(function*() {
      yield* SandboxRuntime
      return undefined
    }) as unknown as Effect.Effect<undefined, never, never>
    return runtime.runPromise(program).then(
      () => {
        throw new Error('expected provisioning to reject the unusable MSB_PATH')
      },
      (failure: unknown) => {
        expect(failure).toMatchObject({ _tag: 'ProvisionError' })
        const message = failureMessage(failure)
        expect(message).toContain("MSB_PATH='/nonexistent/msb'")
        expect(message).toContain('is not an executable file')
      },
    ).finally(() => runtime.dispose())
  })
})

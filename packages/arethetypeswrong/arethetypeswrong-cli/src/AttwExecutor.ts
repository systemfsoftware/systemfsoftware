import {
  CheckPackage,
  CheckPackageLive,
  type CheckResult,
  FilePath,
  PackageStore,
  PackageStoreStub,
  type ResolutionKind,
  type TarballSource,
} from '@systemfsoftware/arethetypeswrong'
import { Effect, Layer, Schema as S } from 'effect'
import * as PlatformFs from 'effect/FileSystem'
import * as PlatformPathMod from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as PlatformTerminal from 'effect/Terminal'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'

import { computeExitCode } from './GetExitCode.js'
import { ComputeExitCodeCommand } from './GetExitCode.schema.js'
import { PackRunner } from './PackRunnerAdapter.js'
import { applyProfile, type CliProfileName } from './Profiles.js'
import { ApplyProfileCommand } from './Profiles.schema.js'
import { RegistryDocument, RegistryFetchError } from './Registry.schema.js'
import { renderAnalysis } from './Render.js'

export type CliFormat = 'auto' | 'table' | 'table-flipped' | 'ascii' | 'json'

export interface CliRequest {
  readonly fileOrDirectory: string
  readonly pack?: boolean
  readonly fromNpm?: boolean
  readonly definitelyTyped?: string | boolean
  readonly format?: CliFormat
  readonly quiet?: boolean
  readonly entrypoints?: readonly string[]
  readonly includeEntrypoints?: readonly string[]
  readonly excludeEntrypoints?: readonly string[]
  readonly entrypointsLegacy?: boolean
  readonly ignoreRules?: readonly string[]
  readonly ignoreResolutions?: readonly ResolutionKind[]
  readonly profile?: CliProfileName
  readonly summary?: boolean
  readonly emoji?: boolean
  readonly color?: boolean
  readonly configPath?: string
  readonly moduleKinds?: readonly string[]
  readonly registry: string
}

const decodeFilePath = (path: string): Effect.Effect<FilePath> =>
  S.decodeUnknownEffect(FilePath)(path).pipe(Effect.orDie)

const localTarball = (path: FilePath): TarballSource => ({ kind: 'local', path })

export const prepareAnalysis = (
  request: CliRequest,
  result: CheckResult,
): {
  result: CheckResult
  ignoreRules: readonly string[]
  ignoreResolutions: readonly ResolutionKind[]
} => {
  const profileDecision = request.profile !== undefined
    ? applyProfile(
      new ApplyProfileCommand(
        request.ignoreResolutions === undefined
          ? { profileName: request.profile }
          : { profileName: request.profile, ignoreResolutions: request.ignoreResolutions },
      ),
    )
    : undefined
  const profileApplied = profileDecision !== undefined
    ? { ...request, ignoreResolutions: profileDecision.ignoreResolutions }
    : request
  const ignoreRules = profileApplied.ignoreRules ?? []
  const ignoreResolutions = profileApplied.ignoreResolutions ?? []
  return { result, ignoreRules, ignoreResolutions }
}

const acquireTarball = (
  request: CliRequest,
): Effect.Effect<
  { bytes: Uint8Array; ref: { packageName: string; packageVersion: string; tarball: TarballSource } },
  never,
  PlatformFs.FileSystem | PlatformPathMod.Path | PackRunner | ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fs = yield* PlatformFs.FileSystem
    const path = yield* PlatformPathMod.Path
    const target = request.fileOrDirectory
    if (request.pack) {
      const packRunner = yield* PackRunner
      const packed = yield* packRunner.pack(target).pipe(Effect.orDie)
      const archive = yield* decodeFilePath(path.join(target, packed.tarballPath))
      const bytes = yield* fs.readFile(archive).pipe(Effect.orDie)
      yield* fs.remove(archive).pipe(Effect.orDie)
      return {
        bytes,
        ref: { packageName: target, packageVersion: 'local', tarball: localTarball(archive) },
      }
    }
    if (target.endsWith('.tgz') || target.endsWith('.tar.gz')) {
      const archive = yield* decodeFilePath(target)
      const bytes = yield* fs.readFile(archive).pipe(Effect.orDie)
      return {
        bytes,
        ref: { packageName: target, packageVersion: 'local', tarball: localTarball(archive) },
      }
    }
    const npmTarget = request.fromNpm
      ? target
      : /^[a-z@]/.test(target) && !target.includes('/')
      ? target
      : `file:${target}`
    const isNpmSpec = !npmTarget.startsWith('file:')
    if (isNpmSpec) {
      const [name, version = 'latest'] = npmTarget.split('@').filter(Boolean)
      const registryJson = yield* Effect.tryPromise({
        try: async (): Promise<unknown> => {
          const res = await fetch(
            `${request.registry.replace(/\/$/, '')}/${encodeURIComponent(name ?? npmTarget)}/${version}`,
          )
          if (res.status === 404) throw new RegistryFetchError({ message: `Package not found: ${npmTarget}` })
          if (!res.ok) throw new RegistryFetchError({ message: `Registry returned ${res.status} for ${npmTarget}` })
          return await res.json()
        },
        catch: (e) =>
          e instanceof RegistryFetchError
            ? e
            : new RegistryFetchError({ message: `Registry request failed for ${npmTarget}`, cause: e }),
      }).pipe(Effect.orDie)
      const registry = yield* S.decodeUnknownEffect(RegistryDocument)(registryJson).pipe(Effect.orDie)
      const tarballRes = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(registry.dist.tarball)
          if (!res.ok) throw new RegistryFetchError({ message: `Tarball fetch returned ${res.status}` })
          return new Uint8Array(await res.arrayBuffer())
        },
        catch: (e) =>
          e instanceof RegistryFetchError
            ? e
            : new RegistryFetchError({ message: `Tarball fetch failed for ${npmTarget}`, cause: e }),
      }).pipe(Effect.orDie)
      return {
        bytes: tarballRes,
        ref: {
          packageName: registry.name,
          packageVersion: registry.version,
          tarball: { kind: 'registry', url: registry.dist.tarball },
        },
      }
    }
    const archive = yield* decodeFilePath(target)
    const bytes = yield* fs.readFile(archive).pipe(Effect.orDie)
    return {
      bytes,
      ref: { packageName: target, packageVersion: 'local', tarball: localTarball(archive) },
    }
  })

export const runAttw = (
  request: CliRequest,
): Effect.Effect<
  number,
  PlatformError,
  | PlatformFs.FileSystem
  | PlatformPathMod.Path
  | PlatformTerminal.Terminal
  | PackRunner
  | ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const terminal = yield* PlatformTerminal.Terminal

    const { bytes, ref } = yield* acquireTarball(request)
    const storeLayer = PackageStoreStub(ref, bytes)
    const checkPackageLayer = CheckPackageLive.pipe(Layer.provide(storeLayer))

    const checkEffect: Effect.Effect<CheckResult, never, never> = Effect.gen(function*() {
      const checkPackage = yield* CheckPackage
      return yield* checkPackage.execute(request.fileOrDirectory, {
        entrypoints: request.entrypoints?.length ? [...request.entrypoints] : undefined,
        includeEntrypoints: request.includeEntrypoints?.length ? [...request.includeEntrypoints] : undefined,
        excludeEntrypoints: request.excludeEntrypoints?.length ? [...request.excludeEntrypoints] : undefined,
        entrypointsLegacy: request.entrypointsLegacy,
      })
    }).pipe(
      Effect.provide(Layer.mergeAll(checkPackageLayer, storeLayer)),
      Effect.catch(() =>
        Effect.succeed<CheckResult>({
          packageName: request.fileOrDirectory,
          packageVersion: 'error',
          types: false,
        })
      ),
    )
    const result = yield* checkEffect
    const prepared = prepareAnalysis(request, result)
    const exitDecision = computeExitCode(
      new ComputeExitCodeCommand({
        result: prepared.result,
        ignoreRules: [...prepared.ignoreRules],
        ignoreResolutions: [...prepared.ignoreResolutions],
      }),
    )
    if (!request.quiet) {
      const output = renderAnalysis(prepared.result, {
        format: request.format ?? 'auto',
        color: request.color ?? true,
        summary: request.summary ?? true,
        ignoreRules: prepared.ignoreRules,
        useEmoji: request.emoji ?? true,
        quiet: request.quiet ?? false,
        terminalWidth: 120,
        isTTY: true,
      })
      yield* terminal.display(output)
    }
    return exitDecision.exitCode
  })

export const _attwCliExecutorUsed = {
  applyProfile,
  computeExitCode,
  renderAnalysis,
  prepareAnalysis,
  CheckPackage,
  PackageStore,
}

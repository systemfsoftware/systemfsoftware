import { layer as nodeCommandExecutorLayer } from '@effect/platform-node-shared/NodeCommandExecutor'
import { CommandExecutor } from '@effect/platform/CommandExecutor'
import {
  CheckPackage,
  CheckPackageLive,
  type CheckResult,
  PackageStoreAdapter,
  PackageStoreAdapterStub,
  type ProblemKind,
  type ResolutionKind,
} from '@systemfsoftware/arethetypeswrong-core'
import { Context, Effect, Layer } from 'effect'

import { CliFilesystem as Filesystem } from './filesystem.adapter.js'
import { computeExitCode, ComputeExitCodeCommand } from './getExitCode.workflow.js'
import { PackRunner } from './pack-runner.adapter.js'
import { applyProfile, ApplyProfileCommand, type CliProfileName } from './profiles.workflow.js'
import { renderAnalysis } from './render.workflow.js'
import { Stdin } from './stdin.adapter.js'
import { Terminal } from './terminal.adapter.js'

export type CliFormat = 'auto' | 'table' | 'table-flipped' | 'ascii' | 'json'

export interface CliRequest {
  readonly fileOrDirectory: string
  readonly pack?: boolean
  readonly fromNpm?: boolean
  readonly definitelyTyped?: string | boolean
  readonly format?: CliFormat
  readonly quiet?: boolean
  readonly entrypoints?: ReadonlyArray<string>
  readonly includeEntrypoints?: ReadonlyArray<string>
  readonly excludeEntrypoints?: ReadonlyArray<string>
  readonly entrypointsLegacy?: boolean
  readonly ignoreRules?: ReadonlyArray<string>
  readonly ignoreResolutions?: ReadonlyArray<ResolutionKind>
  readonly profile?: CliProfileName
  readonly summary?: boolean
  readonly emoji?: boolean
  readonly color?: boolean
  readonly configPath?: string
  readonly moduleKinds?: ReadonlyArray<string>
  readonly registry: string
}

export interface AttwCliExecutorDepsService {
  readonly run: (request: CliRequest) => Effect.Effect<number, never>
}

export class AttwCliExecutorDeps extends Context.Tag(
  '@systemfsoftware/arethetypeswrong-cli/attw.executor/AttwCliExecutorDeps',
)<AttwCliExecutorDeps, AttwCliExecutorDepsService>() {}

export const AttwCliExecutorDepsStub: Layer.Layer<AttwCliExecutorDeps, never, never> = Layer.succeed(
  AttwCliExecutorDeps,
  {
    run: () => Effect.succeed(0),
  },
)

export const prepareAnalysis = (
  request: CliRequest,
  result: CheckResult,
): {
  result: CheckResult
  ignoreRules: ReadonlyArray<string>
  ignoreResolutions: ReadonlyArray<ResolutionKind>
} => {
  const profileDecision = request.profile !== undefined
    ? applyProfile(new ApplyProfileCommand({ profileName: request.profile, request }))
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
  { bytes: Uint8Array; ref: { packageName: string; packageVersion: string; tarballUrl: string } },
  never,
  Filesystem | PackRunner | CommandExecutor
> =>
  Effect.gen(function*() {
    const fs = yield* Filesystem
    const target = request.fileOrDirectory
    if (request.pack) {
      const packRunner = yield* PackRunner
      const packed = yield* packRunner.pack(target).pipe(Effect.orDie)
      const tarballPath = fs.join(target, packed.tarballPath)
      const bytes = yield* fs.readBytes(tarballPath).pipe(Effect.orDie)
      yield* fs.deleteFile(tarballPath)
      return {
        bytes,
        ref: { packageName: target, packageVersion: 'local', tarballUrl: `file://${tarballPath}` },
      }
    }
    if (target.endsWith('.tgz') || target.endsWith('.tar.gz')) {
      const bytes = yield* fs.readBytes(target).pipe(Effect.orDie)
      return {
        bytes,
        ref: { packageName: target, packageVersion: 'local', tarballUrl: `file://${target}` },
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
      const registry = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(
            `${request.registry.replace(/\/$/, '')}/${encodeURIComponent(name ?? npmTarget)}/${version}`,
          )
          if (res.status === 404) throw new Error(`Package not found: ${npmTarget}`)
          if (!res.ok) throw new Error(`Registry returned ${res.status} for ${npmTarget}`)
          return res.json() as Promise<{ name: string; version: string; dist: { tarball: string } }>
        },
        catch: (e) => new Error(String(e)),
      }).pipe(Effect.orDie)
      const tarballRes = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(registry.dist.tarball)
          if (!res.ok) throw new Error(`Tarball fetch returned ${res.status}`)
          return new Uint8Array(await res.arrayBuffer())
        },
        catch: (e) => new Error(String(e)),
      }).pipe(Effect.orDie)
      return {
        bytes: tarballRes,
        ref: { packageName: registry.name, packageVersion: registry.version, tarballUrl: registry.dist.tarball },
      }
    }
    const bytes = yield* fs.readBytes(target).pipe(Effect.orDie)
    return {
      bytes,
      ref: { packageName: target, packageVersion: 'local', tarballUrl: `file://${target}` },
    }
  })

export const runAttw = (
  request: CliRequest,
): Effect.Effect<number, never, Terminal | Filesystem | Stdin | PackRunner | CommandExecutor> =>
  Effect.gen(function*() {
    const terminal = yield* Terminal

    const { bytes, ref } = yield* acquireTarball(request)
    const storeLayer = PackageStoreAdapterStub(ref, bytes)
    const checkPackageLayer = CheckPackageLive.pipe(Layer.provide(storeLayer))

    const checkEffect: Effect.Effect<CheckResult, never, never> = Effect.gen(function*() {
      const checkPackage = yield* CheckPackage
      return yield* checkPackage.execute(request.fileOrDirectory)
    }).pipe(
      Effect.provide(checkPackageLayer),
      Effect.provide(storeLayer),
      Effect.catchAll(() =>
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
      yield* terminal.stdout.write(output)
    }
    return exitDecision.exitCode
  })

export const _attwCliExecutorUsed = {
  applyProfile,
  computeExitCode,
  renderAnalysis,
  prepareAnalysis,
  CheckPackage,
  PackageStoreAdapter,
}

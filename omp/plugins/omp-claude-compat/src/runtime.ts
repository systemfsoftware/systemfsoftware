import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { policyFilePaths, readLayers } from '@systemfsoftware/harness-toml'
import { bootstrapPluginRuntime } from '@systemfsoftware/omp-runtime'
import { Effect, Layer, Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import os from 'node:os'
import { FileReferencedContentLive } from './inject/file-referenced-content.js'
import { DEFAULT_NO_INJECT_REFS, NoInjectRefs, NoInjectRefsLive } from './inject/no-inject-refs.js'
import { ClaudeSettingsLive } from './settings/mod.js'
export const HookScopeLive = Layer.mergeAll(
  Layer.effect(Scope.Scope, Effect.scope),
  ClaudeSettingsLive,
)
const nodeLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(NodePath.layer),
)

const policyLive = NoInjectRefsLive

const deps = Layer.mergeAll(policyLive, nodeLayer)
const referencedLive = FileReferencedContentLive.pipe(Layer.provide(deps))

const appLayer = HookScopeLive.pipe(
  Layer.provideMerge(deps),
  Layer.provideMerge(referencedLive),
)

export type HookRuntimeContext = Layer.Success<typeof appLayer>

export const { runtime, runSafe } = bootstrapPluginRuntime(appLayer)

export default runtime

const resolveHome = (): string => {
  const override = process.env['HARNESS_POLICY_HOME']
  return typeof override === 'string' && override.length > 0 ? override : os.homedir()
}

export const warmHarnessPolicy = (
  cwd: string,
): Effect.Effect<void, never, FileSystem.FileSystem | NoInjectRefs> =>
  Effect.gen(function*() {
    const home = resolveHome()
    const paths = policyFilePaths(home, cwd)
    const policy: Record<string, readonly string[]> = yield* readLayers(paths)
    const svc = yield* NoInjectRefs
    const raw = policy['no_inject_refs']
    svc.set(cwd, raw ?? DEFAULT_NO_INJECT_REFS)
  })

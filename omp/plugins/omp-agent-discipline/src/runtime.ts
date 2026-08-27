import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { homeAnchor, policyFilePaths, readLayers } from '@systemfsoftware/harness-toml'
import { bootstrapPluginRuntime } from '@systemfsoftware/omp-runtime'
import { Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import os from 'node:os'
import { NoDelegateSkills, NoDelegateSkillsLive } from './delegation/config.js'
import { DispatchDoctrineSkills, DispatchDoctrineSkillsLive } from './doctrine/config.js'

export type DisciplineContext = FileSystem.FileSystem | NoDelegateSkills | DispatchDoctrineSkills

const nodeLayer = NodeFileSystem.layer
const policyLive = Layer.mergeAll(NoDelegateSkillsLive, DispatchDoctrineSkillsLive)
const appLayer = Layer.mergeAll(nodeLayer, policyLive)

export const { runtime, runSafe } = bootstrapPluginRuntime(appLayer)

export default runtime

export const warmHarnessPolicy = (
  cwd: string,
): Effect.Effect<void, never, FileSystem.FileSystem | NoDelegateSkills | DispatchDoctrineSkills> =>
  Effect.gen(function*() {
    const home = homeAnchor(process.env, os.homedir())
    const paths = policyFilePaths(home, cwd)
    const policy: Record<string, readonly string[]> = yield* readLayers(paths)
    const nd = yield* NoDelegateSkills
    const dd = yield* DispatchDoctrineSkills
    nd.set(cwd, policy['no_delegate_skills'] ?? [])
    dd.set(cwd, policy['dispatch_doctrine_skills'] ?? [])
  })

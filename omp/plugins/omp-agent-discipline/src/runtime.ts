import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { readLayers } from '@systemfsoftware/harness-toml'
import { bootstrapPluginRuntime } from '@systemfsoftware/omp-runtime'
import { Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import os from 'node:os'
import { DispatchDoctrineSkills, DispatchDoctrineSkillsLive } from './doctrine/config.js'
import { NoDelegateSkills, NoDelegateSkillsLive } from './delegation/config.js'

export type DisciplineContext = FileSystem.FileSystem | PathModule.Path | NoDelegateSkills | DispatchDoctrineSkills

const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
const policyLive = Layer.mergeAll(NoDelegateSkillsLive, DispatchDoctrineSkillsLive)
const appLayer = Layer.mergeAll(nodeLayer, policyLive)

export const { runtime, runSafe } = bootstrapPluginRuntime(appLayer)

export default runtime

const USER_POLICY_DIR = '.config/systemfsoftware'
const PROJECT_POLICY_FILE = 'systemfsoftware.toml'
const LOCAL_POLICY_FILE = 'systemfsoftware.local.toml'

const resolveHome = (): string => {
  const override = process.env['HARNESS_POLICY_HOME']
  return typeof override === 'string' && override.length > 0 ? override : os.homedir()
}

export const warmHarnessPolicy = (cwd: string): Effect.Effect<void, never, FileSystem.FileSystem | PathModule.Path | NoDelegateSkills | DispatchDoctrineSkills> =>
  Effect.gen(function* () {
    const path = yield* PathModule.Path
    const home = resolveHome()
    const paths: readonly string[] = [
      path.join(home, USER_POLICY_DIR, PROJECT_POLICY_FILE),
      path.join(cwd, PROJECT_POLICY_FILE),
      path.join(cwd, LOCAL_POLICY_FILE),
    ]
    const policy: Record<string, readonly string[]> = yield* readLayers(paths)
    const nd = yield* NoDelegateSkills
    const dd = yield* DispatchDoctrineSkills
    nd.set(cwd, policy['no_delegate_skills'] ?? [])
    dd.set(cwd, policy['dispatch_doctrine_skills'] ?? [])
  })

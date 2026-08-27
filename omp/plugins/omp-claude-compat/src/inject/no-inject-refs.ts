import { homeAnchor, policyFilePaths, readLayers } from '@systemfsoftware/harness-toml'
import { Context, Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import os from 'node:os'

export const DEFAULT_NO_INJECT_REFS: readonly string[] = ['AGENTS.md']

export class NoInjectRefs extends Context.Service<
  NoInjectRefs,
  {
    readonly get: (cwd: string) => readonly string[]
    readonly set: (cwd: string, v: readonly string[]) => void
    readonly load: (cwd: string) => Effect.Effect<readonly string[], never, FileSystem.FileSystem>
  }
>()('omp-claude-compat/NoInjectRefs') {}

const cache = new Map<string, readonly string[]>()

export const NoInjectRefsLive: Layer.Layer<NoInjectRefs> = Layer.succeed(NoInjectRefs, {
  get: (cwd: string) => cache.get(cwd) ?? DEFAULT_NO_INJECT_REFS,
  set: (cwd: string, v: readonly string[]) => {
    cache.set(cwd, v)
  },
  load: (cwd: string) =>
    Effect.gen(function*() {
      const cached = cache.get(cwd)
      if (cached !== undefined) return cached
      const home = homeAnchor(process.env, os.homedir())
      const paths = policyFilePaths(home, cwd)
      const policy: Record<string, readonly string[]> = yield* readLayers(paths)
      const value = policy['no_inject_refs'] ?? DEFAULT_NO_INJECT_REFS
      cache.set(cwd, value)
      return value
    }),
})

export const __resetNoInjectRefsForTesting = (): void => {
  cache.clear()
}

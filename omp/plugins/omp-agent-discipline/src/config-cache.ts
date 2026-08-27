import { homeAnchor, policyFilePaths, readLayers } from '@systemfsoftware/harness-toml'
import { Context, Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import os from 'node:os'

export type CacheShape = {
  readonly get: (cwd: string) => readonly string[]
  readonly set: (cwd: string, v: readonly string[]) => void
  readonly load: (cwd: string) => Effect.Effect<readonly string[], never, FileSystem.FileSystem>
}

export const makeStringArrayCache = <Identifier>(
  tag: string,
  policyKey: string,
  fallback: readonly string[],
): {
  Service: Context.Service<Identifier, CacheShape>
  Live: Layer.Layer<Identifier>
  reset: () => void
} => {
  const Service = Context.Service<Identifier, CacheShape>(tag)

  const cache = new Map<string, readonly string[]>()

  const Live = Layer.succeed(Service, {
    get: (cwd: string) => cache.get(cwd) ?? fallback,
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
        const value = policy[policyKey] ?? fallback
        cache.set(cwd, value)
        return value
      }),
  })

  const reset = (): void => {
    cache.clear()
  }

  return { Service, Live, reset }
}

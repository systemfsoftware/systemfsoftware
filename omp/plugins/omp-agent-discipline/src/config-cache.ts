import { Context, Layer } from 'effect'

export type CacheShape = {
  readonly get: (cwd: string) => readonly string[]
  readonly set: (cwd: string, v: readonly string[]) => void
}

export const makeStringArrayCache = <Identifier>(
  tag: string,
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
  })

  const reset = (): void => {
    cache.clear()
  }

  return { Service, Live, reset }
}

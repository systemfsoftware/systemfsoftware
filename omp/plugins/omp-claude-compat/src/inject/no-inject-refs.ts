import { Context, Layer } from 'effect'

export const DEFAULT_NO_INJECT_REFS: readonly string[] = ['AGENTS.md']

export class NoInjectRefs extends Context.Service<
  NoInjectRefs,
  {
    readonly get: (cwd: string) => readonly string[]
    readonly set: (cwd: string, v: readonly string[]) => void
  }
>()('omp-claude-compat/NoInjectRefs') {}

const cache = new Map<string, readonly string[]>()

export const NoInjectRefsLive: Layer.Layer<NoInjectRefs> = Layer.succeed(NoInjectRefs, {
  get: (cwd: string) => cache.get(cwd) ?? DEFAULT_NO_INJECT_REFS,
  set: (cwd: string, v: readonly string[]) => {
    cache.set(cwd, v)
  },
})

export const __resetNoInjectRefsForTesting = (): void => {
  cache.clear()
}

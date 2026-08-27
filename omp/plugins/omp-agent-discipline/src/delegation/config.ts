import { Context, Layer } from 'effect'

export class NoDelegateSkills extends Context.Service<
  NoDelegateSkills,
  {
    readonly get: (cwd: string) => readonly string[]
    readonly set: (cwd: string, v: readonly string[]) => void
  }
>()('omp-agent-discipline/NoDelegateSkills') {}

const cache = new Map<string, readonly string[]>()

export const NoDelegateSkillsLive: Layer.Layer<NoDelegateSkills> = Layer.succeed(NoDelegateSkills, {
  get: (cwd: string) => cache.get(cwd) ?? [],
  set: (cwd: string, v: readonly string[]) => {
    cache.set(cwd, v)
  },
})

export const __resetNoDelegateSkillsForTesting = (): void => {
  cache.clear()
}

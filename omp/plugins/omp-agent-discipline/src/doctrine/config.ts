import { Context, Layer } from 'effect'

export class DispatchDoctrineSkills extends Context.Service<
  DispatchDoctrineSkills,
  {
    readonly get: (cwd: string) => readonly string[]
    readonly set: (cwd: string, v: readonly string[]) => void
  }
>()('omp-agent-discipline/DispatchDoctrineSkills') {}

const cache = new Map<string, readonly string[]>()

export const DispatchDoctrineSkillsLive: Layer.Layer<DispatchDoctrineSkills> = Layer.succeed(
  DispatchDoctrineSkills,
  {
    get: (cwd: string) => cache.get(cwd) ?? [],
    set: (cwd: string, v: readonly string[]) => {
      cache.set(cwd, v)
    },
  },
)

export const __resetDispatchDoctrineSkillsForTesting = (): void => {
  cache.clear()
}

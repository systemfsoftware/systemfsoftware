import { Data } from 'effect'
import { type GatherFacts, type GuardFs, LINTABLE_EXTENSIONS, type Runner } from './facts.ts'

export class Skip extends Data.TaggedClass('Skip')<{
  readonly reason: 'file-missing' | 'not-lintable-extension' | 'no-oxlint-config'
}> {}

export class RunDeno extends Data.TaggedClass('RunDeno')<{
  readonly filePath: string
}> {}

export class RunOxlint extends Data.TaggedClass('RunOxlint')<{
  readonly filePath: string
  readonly configPath: string
}> {}

export type Plan = Skip | RunDeno | RunOxlint

interface PlanRule {
  readonly matches: (facts: GatherFacts) => boolean
  readonly plan: (facts: GatherFacts) => Plan
}

export const isLintableExtension = (extension: string): boolean =>
  (LINTABLE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())

const PLAN_RULES: readonly PlanRule[] = [
  { matches: (f) => !f.exists, plan: () => new Skip({ reason: 'file-missing' }) },
  { matches: (f) => !isLintableExtension(f.extension), plan: () => new Skip({ reason: 'not-lintable-extension' }) },
  {
    matches: (f) => f.denoShebang,
    plan: (f) => new RunDeno({ filePath: f.resolvedPath }),
  },
  { matches: (f) => f.configPath === null, plan: () => new Skip({ reason: 'no-oxlint-config' }) },
  {
    matches: () => true,
    plan: (f) => new RunOxlint({ filePath: f.resolvedPath, configPath: f.configPath ?? '' }),
  },
]

export const planFromFacts = (facts: GatherFacts): Plan =>
  PLAN_RULES.find((rule) => rule.matches(facts))?.plan(facts) ?? PLAN_RULES.at(-1)!.plan(facts)

export interface HookResult {
  readonly exitCode: number
  readonly stderr: string
}

export interface GuardOptions {
  readonly fs: GuardFs
  readonly runner: Runner
  readonly envOverrides: Readonly<Record<string, string | undefined>>
}

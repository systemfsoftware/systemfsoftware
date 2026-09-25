import { Config, Effect, Option } from 'effect'
import { dual } from 'effect/Function'

/**
 * How much schedule exploration a run buys. `per-change` is the budget a pull
 * request is judged on; `local` is a developer's own machine, which caps the
 * preemption bound and the seed count so feedback stays fast. A local pass is
 * not the verdict: the same checks run at the per-change budget in CI.
 */
export type ProfileName = 'local' | 'per-change'

export const pctDepth = 3

export const perChangeSeeds = 250

export const localSeeds = 25

export const localPreemptions = 1

const PROFILES: Readonly<Record<string, ProfileName>> = { local: 'local' }

const profileOf = (name: string): ProfileName => PROFILES[name] ?? 'per-change'

export const currentProfile: Effect.Effect<ProfileName, Config.ConfigError> = Effect.map(
  Config.option(Config.String('CONFORMANCE_PROFILE')),
  Option.match({ onNone: () => profileOf(''), onSome: profileOf }),
)

export interface Budget {
  readonly fibers: number
  readonly steps: number
}

const SEEDS: Readonly<Record<ProfileName, (budget: Budget) => number>> = {
  local: () => localSeeds,
  'per-change': () => perChangeSeeds,
}

const seedsForImpl = (budget: Budget, profile: ProfileName = 'per-change'): number => SEEDS[profile](budget)

const isBudgetFirst = (args: IArguments): boolean => args.length === 0 || typeof args[0] !== 'string'

export const seedsFor: {
  (budget: Budget, profile?: ProfileName): number
  (profile?: ProfileName): (budget: Budget) => number
} = dual(isBudgetFirst, seedsForImpl)

export const currentSeedsFor = (budget: Budget): Effect.Effect<number, Config.ConfigError> =>
  Effect.map(currentProfile, (profile) => seedsFor(budget, profile))

const localBoundOf = (requested: number | undefined): number =>
  Math.min(requested ?? localPreemptions, localPreemptions)

const boundImpl = (requested: number | undefined, profile: ProfileName): number | undefined =>
  profile === 'local' ? localBoundOf(requested) : requested

export const preemptionsFor: {
  (requested: number | undefined, profile: ProfileName): number | undefined
  (profile: ProfileName): (requested: number | undefined) => number | undefined
} = dual(2, boundImpl)

export const currentPreemptionsFor = (
  requested: number | undefined,
): Effect.Effect<number | undefined, Config.ConfigError> =>
  Effect.map(currentProfile, (profile) => preemptionsFor(requested, profile))

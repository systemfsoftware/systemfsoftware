import { Config, Effect, Option } from 'effect'
import { dual } from 'effect/Function'

export type ProfileName = 'per-change' | 'nightly'

export const pctDepth = 3

export const perChangeSeeds = 250

const nightlyMissRate = 0.01

const profileOf = (name: string): ProfileName => (name === 'nightly' ? 'nightly' : 'per-change')

export const currentProfile: Effect.Effect<ProfileName, Config.ConfigError> = Effect.map(
  Config.option(Config.String('CONFORMANCE_PROFILE')),
  Option.match({ onNone: () => profileOf(''), onSome: profileOf }),
)

export interface Budget {
  readonly fibers: number
  readonly steps: number
}

const bugProbability = (fibers: number, steps: number): number => 1 / (fibers * steps ** (pctDepth - 1))

const nightlyRuns = (fibers: number, steps: number): number =>
  Math.ceil(Math.log(nightlyMissRate) / Math.log(1 - bugProbability(fibers, steps)))

const nightlyOf = (budget: Budget): number => nightlyRuns(budget.fibers, budget.steps)

const isNightly = (profile: ProfileName): boolean => profile === 'nightly'

const hasWork = (budget: Budget): boolean => budget.fibers > 0 && budget.steps > 0

const isNightlyBudget = (budget: Budget, profile: ProfileName): boolean => isNightly(profile) && hasWork(budget)

const seedsOf = (budget: Budget, nightly: boolean): number => (nightly ? nightlyOf(budget) : perChangeSeeds)

const seedsForImpl = (budget: Budget, profile: ProfileName = 'per-change'): number =>
  seedsOf(budget, isNightlyBudget(budget, profile))

const isBudgetFirst = (args: IArguments): boolean => args.length === 0 || typeof args[0] !== 'string'

export const seedsFor: {
  (budget: Budget, profile?: ProfileName): number
  (profile?: ProfileName): (budget: Budget) => number
} = dual(isBudgetFirst, seedsForImpl)

export const currentSeedsFor = (budget: Budget): Effect.Effect<number, Config.ConfigError> =>
  Effect.map(currentProfile, (profile) => seedsFor(budget, profile))

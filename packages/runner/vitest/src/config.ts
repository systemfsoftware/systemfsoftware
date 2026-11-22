import { Config, Context, Effect, Layer, Option, Schema } from 'effect'
import {
  DeclaredTier,
  HexCommitSha,
  NonNegativeSeedText,
  PositiveRunCountText,
  type PropertyTier,
} from './internal/property/budget.schema.js'

export const PROPERTY_TIER = Config.option(
  Config.schema(
    DeclaredTier.annotate({ description: 'The property budget tier a run declares, such as nightly' }),
    'PROPERTY_TIER',
  ),
)

export const PROPERTY_RUNS = Config.option(
  Config.schema(
    PositiveRunCountText.annotate({ description: "Runs every property makes, over its own and its tier's count" }),
    'PROPERTY_RUNS',
  ),
)

export const PROPERTY_SEED = Config.option(
  Config.schema(
    NonNegativeSeedText.annotate({ description: 'The seed every property draws from, as a failure printed it' }),
    'PROPERTY_SEED',
  ),
)

export const CONFORMANCE_REPLAY = Config.option(
  Config.schema(
    Schema.String.annotate({ description: 'The replay a rerun line carries: one recorded failure to run again' }),
    'CONFORMANCE_REPLAY',
  ),
)

export const CI = Config.option(
  Config.schema(Schema.String.annotate({ description: 'Set on a CI runner; false and 0 mean off' }), 'CI'),
)

export const AGENT = Config.option(
  Config.schema(Schema.String.annotate({ description: 'Set when a coding agent runs the tests' }), 'AGENT'),
)

export const STRYKER_MUTATOR_WORKER = Config.option(
  Config.schema(
    Schema.String.annotate({ description: 'Set by Stryker inside a mutation-testing worker' }),
    'STRYKER_MUTATOR_WORKER',
  ),
)

export const GITHUB_SHA = Config.option(
  Config.schema(HexCommitSha.annotate({ description: 'The commit a GitHub Actions run checked out' }), 'GITHUB_SHA'),
)

export const CI_COMMIT_SHA = Config.option(
  Config.schema(HexCommitSha.annotate({ description: 'The commit a GitLab CI run checked out' }), 'CI_COMMIT_SHA'),
)

export const COMMIT_SHA = Config.option(
  Config.schema(HexCommitSha.annotate({ description: 'The commit any other CI run checked out' }), 'COMMIT_SHA'),
)

export interface PropertySettings {
  readonly tier: PropertyTier
  readonly runs: Option.Option<number>
  readonly seed: Option.Option<number>
  readonly replay: Option.Option<string>
  readonly commit: Option.Option<string>
}

export interface TierFacts {
  readonly replay: Option.Option<string>
  readonly mutationWorker: Option.Option<string>
  readonly declared: Option.Option<DeclaredTier>
  readonly agent: Option.Option<string>
  readonly ci: Option.Option<string>
}

const CI_OFF: ReadonlyArray<string> = ['', 'false', '0']

const isCiOn = (value: string): boolean => !CI_OFF.includes(value)

const tierWhen = <A>(fact: Option.Option<A>, tier: PropertyTier): Option.Option<PropertyTier> => Option.as(fact, tier)

export const tierOf = (facts: TierFacts): PropertyTier =>
  Option.getOrElse(
    Option.firstSomeOf<PropertyTier>([
      tierWhen(facts.replay, 'replay'),
      tierWhen(facts.mutationWorker, 'mutation'),
      facts.declared,
      tierWhen(facts.agent, 'local'),
      tierWhen(Option.filter(facts.ci, isCiOn), 'ci'),
    ]),
    (): PropertyTier => 'local',
  )

const isNonEmpty = (value: string): boolean => value.length > 0

const settings: Effect.Effect<PropertySettings, Config.ConfigError> = Effect.gen(function*() {
  const replay = Option.filter(yield* CONFORMANCE_REPLAY, isNonEmpty)
  const tier = tierOf({
    replay,
    mutationWorker: yield* STRYKER_MUTATOR_WORKER,
    declared: yield* PROPERTY_TIER,
    agent: yield* AGENT,
    ci: yield* CI,
  })
  const commit = Option.firstSomeOf([yield* GITHUB_SHA, yield* CI_COMMIT_SHA, yield* COMMIT_SHA])
  return { tier, runs: yield* PROPERTY_RUNS, seed: yield* PROPERTY_SEED, replay, commit }
})

export class PropertyConfig extends Context.Service<PropertyConfig, PropertySettings>()(
  '@systemfsoftware/vitest/PropertyConfig',
) {
  static readonly layer = Layer.effect(this, settings)
}

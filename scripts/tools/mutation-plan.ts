// mutation-plan - read the mutant ids a `stryker plan` file lists, for the tools that price a plan
// (record-pricing) and judge a shard's reuse (run-reuse). Malformed parts read as empty, so a
// tool decides on what the plan does list rather than throwing on a shape it does not know.

export const objectOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

export const arrayOf = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []

export const stringsOf = (value: unknown): readonly string[] =>
  arrayOf(value).filter((item): item is string => typeof item === 'string')

const idsOf = (shards: readonly unknown[]): ReadonlySet<string> =>
  new Set(
    shards.flatMap((shard) =>
      arrayOf(objectOf(shard).projects).flatMap((project) => stringsOf(objectOf(project).mutants))
    ),
  )

/** Every mutant id a plan lists, across its shards and projects. */
export const plannedIdsOf = (plan: unknown): ReadonlySet<string> => idsOf(arrayOf(objectOf(plan).shards))

/** The mutant ids the plan's shard `index` lists. */
export const shardIdsOf = (plan: unknown, index: number): ReadonlySet<string> =>
  idsOf(arrayOf(objectOf(plan).shards).filter((shard) => objectOf(shard).index === index))

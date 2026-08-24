export interface DiffChanges {
  readonly added: number
  readonly removed: number
}

export type DiffChange = 'added' | 'removed'

export interface DiffStatistics {
  readonly changesByFile: ReadonlyMap<string, DiffChanges>
  readonly total: DiffChanges
}

const ZERO = 0
const ONE = 1

export const emptyDiffChanges = (): DiffChanges => ({ added: ZERO, removed: ZERO })

export const diffChangesToString = (changes: Readonly<DiffChanges>): string => `+${changes.added} -${changes.removed}`

export const emptyDiffStatistics = (): DiffStatistics => ({
  changesByFile: new Map<string, DiffChanges>(),
  total: emptyDiffChanges(),
})

export const diffStatisticsCount = (
  stats: Readonly<DiffStatistics>,
  input: Readonly<{ file: string; change: DiffChange; amount?: number }>,
): DiffStatistics => {
  const amount = input.amount ?? ONE
  if (amount === ZERO) {
    return stats
  }
  const existing = stats.changesByFile.get(input.file)
  const base: DiffChanges = existing ?? emptyDiffChanges()
  let nextChanges: DiffChanges = base
  let nextTotal: DiffChanges = stats.total
  switch (input.change) {
    case 'added': {
      nextChanges = { added: base.added + amount, removed: base.removed }
      nextTotal = { added: stats.total.added + amount, removed: stats.total.removed }
      break
    }
    case 'removed': {
      nextChanges = { added: base.added, removed: base.removed + amount }
      nextTotal = { added: stats.total.added, removed: stats.total.removed + amount }
      break
    }
    default: {
      break
    }
  }
  const nextMap = new Map(stats.changesByFile)
  nextMap.set(input.file, nextChanges)
  return { changesByFile: nextMap, total: nextTotal }
}

export const diffStatisticsDetailedReport = (stats: Readonly<DiffStatistics>): readonly string[] =>
  [...stats.changesByFile.entries()].map(
    ([fileName, changes]) => `${fileName} ${diffChangesToString(changes)}`,
  )

export const diffStatisticsTotalsReport = (stats: Readonly<DiffStatistics>): string =>
  `${stats.changesByFile.size} files changed (${diffChangesToString(stats.total)})`

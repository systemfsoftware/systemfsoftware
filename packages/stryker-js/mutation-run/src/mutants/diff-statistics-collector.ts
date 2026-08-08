export class DiffChanges {
  public added = 0
  public removed = 0
  public toString(): string {
    return `+${this.added} -${this.removed}`
  }
}
export type DiffChange = 'added' | 'removed'

export class DiffStatisticsCollector {
  public readonly changesByFile = new Map<string, DiffChanges>()
  public readonly total = new DiffChanges()

  public count(file: string, change: DiffChange, amount = 1): void {
    if (amount === 0) {
      // Nothing to see here
      return
    }
    let changes = this.changesByFile.get(file)
    if (!changes) {
      changes = new DiffChanges()
      this.changesByFile.set(file, changes)
    }
    switch (change) {
      case 'added':
        changes.added += amount
        this.total.added += amount
        break
      case 'removed':
        changes.removed += amount
        this.total.removed += amount
        break
    }
  }

  public createDetailedReport(): string[] {
    return [...this.changesByFile.entries()].map(
      ([fileName, changes]) => `${fileName} ${changes.toString()}`,
    )
  }

  public createTotalsReport(): string {
    return `${this.changesByFile.size} files changed (${this.total.toString()})`
  }
}

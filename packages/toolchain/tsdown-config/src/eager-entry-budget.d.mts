/** A rolldown output chunk, as far as the budget reads it. */
export interface BudgetedChunk {
  readonly type: 'chunk'
  readonly fileName: string
  readonly isEntry: boolean
  readonly imports: readonly string[]
  readonly code: string
}

/** Any other rolldown output file; the budget skips it. */
export interface BudgetedAsset {
  readonly type: 'asset'
}

/** The rolldown plugin `eagerEntryBudget` returns. */
export interface EagerEntryBudgetPlugin {
  readonly name: 'omp-eager-entry-budget'
  generateBundle(
    this: { error(message: string): never },
    options: unknown,
    bundle: Readonly<Record<string, BudgetedChunk | BudgetedAsset>>,
  ): void
}

/**
 * Fails the build when an omp plugin entry's static closure exceeds `maxBytes`
 * (default 32 KiB) or leaves `effect` external.
 */
export declare function eagerEntryBudget(options?: { readonly maxBytes?: number }): EagerEntryBudgetPlugin

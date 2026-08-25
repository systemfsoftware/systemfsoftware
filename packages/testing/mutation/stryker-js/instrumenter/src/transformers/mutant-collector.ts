import type { types } from '@babel/core'
import { type Position } from '@systemfsoftware/stryker-js-plugin-api/core'

import { createMutant, type Mutable, type Mutant } from '../mutant.js'

export type MutantCollector = Mutant[]

export function createMutantCollector(): MutantCollector {
  return []
}

export function collect(
  collector: MutantCollector,
  fileName: string,
  original: types.Node,
  mutable: Mutable,
  offset: Position = { line: 0, column: 0 },
): Mutant {
  const mutant = createMutant(
    collector.length.toString(),
    fileName,
    original,
    mutable,
    offset,
  )
  collector.push(mutant)
  return mutant
}

export function hasPlacedMutants(
  collector: readonly Mutant[],
  fileName: string,
): boolean {
  return collector.some(
    (mutant) => mutant.fileName === fileName && !mutant.ignoreReason,
  )
}

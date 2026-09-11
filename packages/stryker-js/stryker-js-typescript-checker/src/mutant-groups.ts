import { type Mutant, normalizeFileName } from '@systemfsoftware/stryker-js/Mutant'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import { createGroups, type TSFileNode } from './Compiler.js'

export const groupMutants = (
  mutants: readonly Mutant[],
  nodes: MutableHashMap.MutableHashMap<string, TSFileNode>,
  prioritizePerformanceOverAccuracy: boolean,
): ReadonlyArray<ReadonlyArray<string>> => {
  if (!prioritizePerformanceOverAccuracy) {
    return [mutants.map((mutant) => mutant.id)]
  }
  const inside = mutants.filter((mutant) =>
    Option.isSome(MutableHashMap.get(nodes, normalizeFileName(mutant.fileName)))
  )
  const outside = mutants.filter((mutant) =>
    Option.isNone(MutableHashMap.get(nodes, normalizeFileName(mutant.fileName)))
  )
  if (inside.length === 0) {
    return mutants.map((mutant) => [mutant.id])
  }
  const groups = createGroups([...inside], nodes)
  if (outside.length > 0) {
    return [outside.map((mutant) => mutant.id), ...groups]
  }
  return groups
}

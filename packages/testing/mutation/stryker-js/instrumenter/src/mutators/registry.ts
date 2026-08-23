import type { NodeMutator } from './node-mutator.js'

const mutatorRegistry: NodeMutator[] = []

export function registerMutator(mutator: NodeMutator): void {
  mutatorRegistry.push(mutator)
}

export const allMutators: readonly NodeMutator[] = mutatorRegistry

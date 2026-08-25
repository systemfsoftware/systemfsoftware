import type { types } from '@babel/core'

export interface MutatorContext {
  readonly parent: types.Node | undefined
  readonly grandParent: types.Node | undefined
  readonly ancestors: readonly types.Node[]
}

/**
 * One mutator: a pure function from a node to the mutants it produces.
 *
 * A function, not an object with a `mutate` method and a `name` field. The name
 * lived inside every mutator AND as its position in a hand-written list, so the
 * two could disagree; the registry's key is now the only place a name is
 * written.
 */
export type Mutator = (node: types.Node, context: MutatorContext) => Iterable<types.Node>

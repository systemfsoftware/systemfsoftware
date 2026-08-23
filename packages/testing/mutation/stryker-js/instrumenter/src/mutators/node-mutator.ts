import type { types } from '@babel/core'

export interface MutatorContext {
  readonly parent: types.Node | undefined
  readonly grandParent: types.Node | undefined
  readonly ancestors: readonly types.Node[]
}

export interface NodeMutator {
  readonly name: string
  mutate(node: types.Node, context: MutatorContext): Iterable<types.Node>
}

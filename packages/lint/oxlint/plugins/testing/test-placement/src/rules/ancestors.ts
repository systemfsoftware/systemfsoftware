import type { ESTree } from '@oxlint/plugins'

/**
 * True when `node` sits inside `consequent` — its parent chain crosses the
 * guard block. Shared by the rules that judge only what an in-source block
 * contains.
 */
export const isInsideConsequent = (
  node: { readonly parent: ESTree.Node | null },
  consequent: ESTree.Node,
): boolean => {
  let current = node.parent
  while (current !== null) {
    if (current === consequent) return true
    current = current.parent
  }
  return false
}

/**
 * The binding a call is made against: the callee identifier itself, or the
 * base identifier of a member chain (`fs`, `fs.promises`) when the call is
 * `fs.readFileSync(...)` / `fs.promises.readFile(...)`. Anything else — a
 * computed call, a `super` edge, an erased type construct — has no binding
 * name to judge.
 */
export const bindingBase = (callee: ESTree.Expression): string | undefined => {
  if (callee.type === 'MemberExpression') return bindingBase(callee.object)
  if (callee.type === 'Identifier') return callee.name
  return undefined
}

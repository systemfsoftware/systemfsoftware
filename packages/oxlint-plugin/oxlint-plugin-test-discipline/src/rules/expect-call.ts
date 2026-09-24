import type { ESTree } from '@oxlint/plugins'

const EXPECT = 'expect'

export type IntermediateMember = (member: ESTree.MemberExpression) => boolean

const isExpectCallee = (callee: ESTree.CallExpression['callee']): boolean =>
  callee.type === 'Identifier' && callee.name === EXPECT

export const expectCallOf = (
  node: ESTree.CallExpression,
  acceptsMember?: IntermediateMember,
): ESTree.CallExpression | undefined => {
  if (node.callee.type !== 'MemberExpression') return undefined
  let target: ESTree.Node = node.callee.object
  while (target.type === 'MemberExpression') {
    if (acceptsMember !== undefined && acceptsMember(target) === false) return undefined
    target = target.object
  }
  if (target.type !== 'CallExpression' || isExpectCallee(target.callee) === false) return undefined
  return target
}

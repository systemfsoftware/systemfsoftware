import type { ESTree } from '@oxlint/plugins'

export const isTaggedClassOrError = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type === 'CallExpression') {
    const inner = node.callee
    if (inner.callee.type !== 'MemberExpression') return false
    const callee = inner.callee
    if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
    if (callee.property.type !== 'Identifier') return false
    return callee.property.name === 'TaggedClass' || callee.property.name === 'TaggedError'
  }
  if (node.callee.type === 'MemberExpression') {
    const callee = node.callee
    if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
    if (callee.property.type !== 'Identifier') return false
    return callee.property.name === 'TaggedClass' || callee.property.name === 'TaggedError'
  }
  return false
}

export const getTypeIdIdentifier = (cls: ESTree.Class): string | undefined => {
  for (const el of cls.body.body) {
    if (el.type !== 'PropertyDefinition') continue
    if (el.computed && el.key.type === 'Identifier') {
      return el.key.name
    }
  }
  return undefined
}

export const getClassName = (node: ESTree.Class): string | undefined => node.id?.name

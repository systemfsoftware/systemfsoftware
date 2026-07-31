import type { Identifier, MetaProperty } from '../ast-node.schema.js'

export const identifier = (name: string): Identifier => ({ type: 'Identifier', name })

export const metaOf = (meta: string, property: string): MetaProperty => ({
  type: 'MetaProperty',
  meta: identifier(meta),
  property: identifier(property),
})

export const importMetaMember = (property: string) => ({
  type: 'MemberExpression' as const,
  object: metaOf('import', 'meta'),
  property: identifier(property),
})

export const binaryOf = (left: unknown, right: unknown) => ({
  type: 'BinaryExpression' as const,
  left,
  right,
})

export const guardOf = (test: unknown) => ({ type: 'IfStatement' as const, test })

interface Identifier {
  readonly type: 'Identifier'
  readonly name: string
}

interface StringLiteral {
  readonly type: 'Literal'
  readonly value: string
}

interface MemberExpression {
  readonly type: 'MemberExpression'
  readonly object: Identifier
  readonly property: Identifier
}

interface CallExpression {
  readonly type: 'CallExpression'
  readonly callee: AstNode
  readonly arguments: readonly AstNode[]
}

type AstNode = unknown

export const identifier = (name: string): Identifier => ({ type: 'Identifier', name })

export const memberOf = (object: string, property: string): MemberExpression => ({
  type: 'MemberExpression',
  object: identifier(object),
  property: identifier(property),
})

export const callOf = (callee: AstNode, args: readonly AstNode[]): CallExpression => ({
  type: 'CallExpression',
  callee,
  arguments: args,
})

export const symbolForCall = (description: AstNode): CallExpression => callOf(memberOf('Symbol', 'for'), [description])

export const taggedCall = (factory: string, tag: AstNode, fields: AstNode): CallExpression =>
  callOf(callOf(memberOf('Schema', factory), []), [tag, fields])

export const bareFactoryCall = (factory: string, tag: AstNode, fields: AstNode): CallExpression =>
  callOf(callOf(identifier(factory), []), [tag, fields])

/**
 * `Schema.Class<A>('Id')(fields)` - the identifier rides the inner call and the fields the
 * outer one, which is the opposite of `taggedCall`'s arrangement and the shape the ignorer
 * missed until the class rules were added.
 */
export const classCall = (id: AstNode, fields: AstNode): CallExpression =>
  callOf(callOf(memberOf('Schema', 'Class'), [id]), [fields])

/** `X.pipe(S.brand('Name'))`'s inner call - the brand name is identity data. */
export const brandCall = (name: AstNode): CallExpression => callOf(memberOf('S', 'brand'), [name])

export interface PropertyNode {
  readonly type: 'Property'
  readonly computed: boolean
  readonly key: AstNode
  readonly value: AstNode
}

export interface ObjectNode {
  readonly type: 'ObjectExpression'
  readonly properties: readonly PropertyNode[]
}

export const propertyOf = (key: AstNode, value: AstNode, computed = false): PropertyNode => ({
  type: 'Property',
  computed,
  key,
  value,
})

export const namedProperty = (key: string, value: AstNode): PropertyNode => propertyOf(identifier(key), value)

export const objectOf = (properties: readonly PropertyNode[]): ObjectNode => ({
  type: 'ObjectExpression',
  properties,
})

export const stringLiteral = (value: string): StringLiteral => ({ type: 'Literal', value })

export const objectExpression = (properties: readonly PropertyNode[] = []): ObjectNode => ({
  type: 'ObjectExpression',
  properties,
})

export const annotationsCall = (argument: AstNode): CallExpression => callOf(memberOf('S', 'annotations'), [argument])

import { FastCheck as fc } from 'effect/testing'
import {
  type AstNode,
  type CallExpression,
  type Identifier,
  type MemberExpression,
} from '../../src/effect-schema-ignorer/AstNode.schema.js'

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

export const taggedFactory = fc.constantFrom('TaggedClass', 'TaggedError')

export const nonTaggedFactory = fc.constantFrom('Struct', 'Class', 'Union', 'TaggedRequest', 'tag', 'Literal')

export const nonSymbolForMember = fc.oneof(
  fc.tuple(fc.constant('Symbol'), fc.constantFrom('iterator', 'keyFor', 'description')),
  fc.tuple(fc.constantFrom('Reflect', 'Object', 'globalThis'), fc.constant('for')),
  fc.tuple(fc.constantFrom('Reflect', 'Match', 'Effect'), fc.constantFrom('tag', 'gen', 'sync')),
)

export interface PropertyNode {
  readonly type: 'ObjectProperty'
  readonly computed: boolean
  readonly key: AstNode
  readonly value: AstNode
}

export interface ObjectNode {
  readonly type: 'ObjectExpression'
  readonly properties: readonly PropertyNode[]
}

export const propertyOf = (key: AstNode, value: AstNode, computed = false): PropertyNode => ({
  type: 'ObjectProperty',
  computed,
  key,
  value,
})

export const namedProperty = (key: string, value: AstNode): PropertyNode => propertyOf(identifier(key), value)

export const objectOf = (properties: readonly PropertyNode[]): ObjectNode => ({
  type: 'ObjectExpression',
  properties,
})

export const annotationsCall = (argument: AstNode): CallExpression => callOf(memberOf('S', 'annotations'), [argument])

export const documentationKey = fc.constantFrom('identifier', 'description', 'title', 'documentation', 'examples')

export const behaviourKey = fc.constantFrom('arbitrary', 'pretty', 'equivalence', 'message', 'jsonSchema')

export const nonAnnotationsMethod = fc.constantFrom('filter', 'transform', 'pipe', 'brand', 'annotate')

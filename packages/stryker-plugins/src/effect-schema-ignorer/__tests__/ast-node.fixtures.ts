import { FastCheck as fc } from 'effect'
import { type AstNode, type CallExpression, type Identifier, type MemberExpression } from '../ast-node.schema.js'

export const identifier = (name: string): Identifier => ({ type: 'Identifier', name })

export const memberOf = (object: string, property: string): MemberExpression => ({
  type: 'MemberExpression',
  object: identifier(object),
  property: identifier(property),
})

export const callOf = (callee: AstNode, args: ReadonlyArray<AstNode>): CallExpression => ({
  type: 'CallExpression',
  callee,
  arguments: args,
})

export const symbolForCall = (description: AstNode): CallExpression => callOf(memberOf('Symbol', 'for'), [description])

export const taggedCall = (factory: string, tag: AstNode, fields: AstNode): CallExpression =>
  callOf(callOf(memberOf('Schema', factory), []), [tag, fields])

export const bareFactoryCall = (factory: string, tag: AstNode, fields: AstNode): CallExpression =>
  callOf(callOf(identifier(factory), []), [tag, fields])

export const taggedFactory = fc.constantFrom('TaggedClass', 'TaggedError')

export const nonTaggedFactory = fc.constantFrom('Struct', 'Class', 'Union', 'TaggedRequest', 'tag', 'Literal')

export const nonSymbolForMember = fc.oneof(
  fc.tuple(fc.constant('Symbol'), fc.constantFrom('iterator', 'keyFor', 'description')),
  fc.tuple(fc.constantFrom('Reflect', 'Object', 'globalThis'), fc.constant('for')),
  fc.tuple(fc.constantFrom('Reflect', 'Match', 'Effect'), fc.constantFrom('tag', 'gen', 'sync')),
)

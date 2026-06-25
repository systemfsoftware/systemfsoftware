import { describe, it } from '@effect/vitest'
import { FastCheck as fc, Schema as S } from 'effect'
import {
  type AstNode,
  type CallExpression,
  type Identifier,
  type MemberExpression,
  ObjectExpression,
  StringLiteral,
} from '../ast-node.schema.js'
import {
  decideSchemaDeclarationIgnore,
  SYMBOL_DESCRIPTION_IGNORED,
  TAGGED_FIELDS_IGNORED,
  TAGGED_TAG_IGNORED,
} from '../schema-declaration-ignore.js'

const identifier = (name: string): Identifier => ({ type: 'Identifier', name })
const memberOf = (object: string, property: string): MemberExpression => ({
  type: 'MemberExpression',
  object: identifier(object),
  property: identifier(property),
})
const callOf = (callee: AstNode, args: ReadonlyArray<AstNode>): CallExpression => ({
  type: 'CallExpression',
  callee,
  arguments: args,
})
const symbolForCall = (description: AstNode): CallExpression => callOf(memberOf('Symbol', 'for'), [description])
const taggedCall = (factory: string, tag: AstNode, fields: AstNode): CallExpression =>
  callOf(callOf(memberOf('Schema', factory), []), [tag, fields])
const bareFactoryCall = (factory: string, tag: AstNode, fields: AstNode): CallExpression =>
  callOf(callOf(identifier(factory), []), [tag, fields])

const taggedFactory = fc.constantFrom('TaggedClass', 'TaggedError')
const nonTaggedFactory = fc.constantFrom('Struct', 'Class', 'Union', 'TaggedRequest', 'tag', 'Literal')
const nonSymbolForMember = fc.oneof(
  fc.tuple(fc.constant('Symbol'), fc.constantFrom('iterator', 'keyFor', 'description')),
  fc.tuple(fc.constantFrom('Reflect', 'Object', 'globalThis'), fc.constant('for')),
  fc.tuple(fc.constantFrom('Reflect', 'Match', 'Effect'), fc.constantFrom('tag', 'gen', 'sync')),
)

describe('decideSchemaDeclarationIgnore — recognised declarations are ignored', () => {
  it.prop(
    '∀d_SymbolForBrandDescription_∈Ignored',
    [StringLiteral],
    ([description]) =>
      decideSchemaDeclarationIgnore(description, symbolForCall(description)) === SYMBOL_DESCRIPTION_IGNORED,
  )

  it.prop(
    '∀c_TaggedClassOrErrorTag_∈Ignored',
    [StringLiteral, ObjectExpression, taggedFactory],
    ([tag, fields, factory]) =>
      decideSchemaDeclarationIgnore(tag, taggedCall(factory, tag, fields)) === TAGGED_TAG_IGNORED,
  )

  it.prop(
    '∀c_TaggedClassOrErrorFields_∈Ignored',
    [StringLiteral, ObjectExpression, taggedFactory],
    ([tag, fields, factory]) =>
      decideSchemaDeclarationIgnore(fields, taggedCall(factory, tag, fields)) === TAGGED_FIELDS_IGNORED,
  )
})

describe('decideSchemaDeclarationIgnore — only the exact discriminant matches', () => {
  it.prop(
    '∀p_MemberNameOtherThanSymbolFor_⊥Ignored',
    [StringLiteral, nonSymbolForMember],
    ([description, [object, property]]) =>
      decideSchemaDeclarationIgnore(description, callOf(memberOf(object, property), [description])) === undefined,
  )

  it.prop(
    '∀f_FactoryNameOtherThanTagged_⊥Ignored',
    [StringLiteral, ObjectExpression, nonTaggedFactory],
    ([tag, fields, factory]) => {
      const call = taggedCall(factory, tag, fields)
      return decideSchemaDeclarationIgnore(tag, call) === undefined &&
        decideSchemaDeclarationIgnore(fields, call) === undefined
    },
  )

  it('Should_IgnoreTaggedArgs_When_FactoryIsBareIdentifier', () => {
    const tag: StringLiteral = { type: 'StringLiteral', value: 'someTag' }
    const fields: ObjectExpression = { type: 'ObjectExpression' }
    const tagResult = decideSchemaDeclarationIgnore(tag, bareFactoryCall('TaggedClass', tag, fields))
    const fieldsResult = decideSchemaDeclarationIgnore(fields, bareFactoryCall('TaggedClass', tag, fields))
    return tagResult === undefined && fieldsResult === undefined
  })
})

describe('decideSchemaDeclarationIgnore — position and node-type are load-bearing', () => {
  it.prop(
    '∀c_ObjectAtTagPosition_⊥Ignored',
    [StringLiteral, ObjectExpression, taggedFactory],
    ([tag, fields, factory]) => decideSchemaDeclarationIgnore(fields, taggedCall(factory, fields, tag)) === undefined,
  )

  it.prop(
    '∀c_NonStringAtSymbolForArgument_⊥Ignored',
    [ObjectExpression],
    ([node]) => decideSchemaDeclarationIgnore(node, symbolForCall(node)) === undefined,
  )

  it.prop(
    '∀c_UnreferencedNodeBesideTheArgument_⊥Ignored',
    [StringLiteral, StringLiteral],
    ([description, other]) => decideSchemaDeclarationIgnore(description, symbolForCall(other)) === undefined,
  )
})

describe('decideSchemaDeclarationIgnore — behaviour and unrelated input are never ignored', () => {
  it.prop(
    '∀t_MatchTagDiscriminantString_⊥Ignored',
    [StringLiteral],
    ([tag]) => decideSchemaDeclarationIgnore(tag, callOf(memberOf('Match', 'tag'), [tag])) === undefined,
  )

  it.prop(
    '∀n_AnyNodeWithoutParent_⊥Ignored',
    [S.Unknown],
    ([node]) => decideSchemaDeclarationIgnore(node, undefined) === undefined,
  )

  it.prop('∀n_ArbitraryNodeAndParent_∈KnownReasons', [S.Unknown, S.Unknown], ([node, parent]) => {
    const result = decideSchemaDeclarationIgnore(node, parent)
    return result === undefined ||
      result === SYMBOL_DESCRIPTION_IGNORED ||
      result === TAGGED_TAG_IGNORED ||
      result === TAGGED_FIELDS_IGNORED
  })
})

import { describe, it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { ObjectExpression, StringLiteral } from '../ast-node.schema.js'
import {
  decideSchemaDeclarationIgnore,
  SYMBOL_DESCRIPTION_IGNORED,
  TAGGED_FIELDS_IGNORED,
  TAGGED_TAG_IGNORED,
} from '../schema-declaration-ignore.js'
import {
  callOf,
  memberOf,
  nonSymbolForMember,
  nonTaggedFactory,
  symbolForCall,
  taggedCall,
  taggedFactory,
} from './ast-node.fixtures.js'

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

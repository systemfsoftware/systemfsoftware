import type * as t from '@babel/types'
import { describe, expect, test } from 'tstyche'
import type {
  CallExpression,
  Identifier,
  MemberExpression,
  ObjectExpression,
  StringLiteral,
} from '../ast-node.schema.js'

describe('AST node schemas are typed equivalently to @babel/types nodes', () => {
  test('Should_AcceptBabelIdentifier_When_TypedAsIdentifierSchema', () => {
    expect<Identifier>().type.toBeAssignableFrom<t.Identifier>()
  })

  test('Should_AcceptBabelStringLiteral_When_TypedAsStringLiteralSchema', () => {
    expect<StringLiteral>().type.toBeAssignableFrom<t.StringLiteral>()
  })

  test('Should_AcceptBabelObjectExpression_When_TypedAsObjectExpressionSchema', () => {
    expect<ObjectExpression>().type.toBeAssignableFrom<t.ObjectExpression>()
  })

  test('Should_AcceptBabelMemberExpression_When_TypedAsMemberExpressionSchema', () => {
    expect<MemberExpression>().type.toBeAssignableFrom<t.MemberExpression>()
  })

  test('Should_AcceptBabelCallExpression_When_TypedAsCallExpressionSchema', () => {
    expect<CallExpression>().type.toBeAssignableFrom<t.CallExpression>()
  })

  test('Should_DiscriminateOnType_When_NodeTypeIsTheLiteralTag', () => {
    expect<Identifier['type']>().type.toBe<'Identifier'>()
    expect<CallExpression['type']>().type.toBe<'CallExpression'>()
  })
})

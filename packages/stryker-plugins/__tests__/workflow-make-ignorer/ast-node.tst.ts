import type * as t from '@babel/types'
import { describe, expect, test } from 'tstyche'
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionExpression,
  Identifier,
  MemberExpression,
  StringLiteral,
} from '../../src/workflow-make-ignorer/ast-node.kernel.js'

describe('Workflow-make boundary AST node schemas are typed equivalently to @babel/types nodes', () => {
  test('Should_AcceptBabelIdentifier_When_TypedAsIdentifierSchema', () => {
    expect<Identifier>().type.toBeAssignableFrom<t.Identifier>()
  })

  test('Should_AcceptBabelStringLiteral_When_TypedAsStringLiteralSchema', () => {
    expect<StringLiteral>().type.toBeAssignableFrom<t.StringLiteral>()
  })

  test('Should_AcceptBabelMemberExpression_When_TypedAsMemberExpressionSchema', () => {
    expect<MemberExpression>().type.toBeAssignableFrom<t.MemberExpression>()
  })

  test('Should_AcceptBabelCallExpression_When_TypedAsCallExpressionSchema', () => {
    expect<CallExpression>().type.toBeAssignableFrom<t.CallExpression>()
  })

  test('Should_AcceptBabelArrowFunctionExpression_When_TypedAsArrowFunctionExpressionSchema', () => {
    expect<ArrowFunctionExpression>().type.toBeAssignableFrom<t.ArrowFunctionExpression>()
  })

  test('Should_AcceptBabelFunctionExpression_When_TypedAsFunctionExpressionSchema', () => {
    expect<FunctionExpression>().type.toBeAssignableFrom<t.FunctionExpression>()
  })

  test('Should_DiscriminateOnType_When_NodeTypeIsTheLiteralTag', () => {
    expect<Identifier['type']>().type.toBe<'Identifier'>()
    expect<CallExpression['type']>().type.toBe<'CallExpression'>()
    expect<MemberExpression['type']>().type.toBe<'MemberExpression'>()
  })
})

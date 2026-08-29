import type * as t from 'estree'
import { describe, expect, test } from 'tstyche'
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionExpression,
  Identifier,
  MemberExpression,
  StringLiteral,
} from '../../../src/workflow-make-ignorer/AstNode.schema.js'

describe('Workflow-make boundary AST node schemas are typed equivalently to estree nodes', () => {
  test('Should_AcceptEstreeIdentifier_When_TypedAsIdentifierSchema', () => {
    expect<Identifier>().type.toBeAssignableFrom<t.Identifier>()
  })

  test('Should_AcceptEstreeStringLiteral_When_TypedAsStringLiteralSchema', () => {
    expect<StringLiteral>().type.toBeAssignableFrom<t.Literal & { value: string }>()
  })

  test('Should_AcceptEstreeMemberExpression_When_TypedAsMemberExpressionSchema', () => {
    expect<MemberExpression>().type.toBeAssignableFrom<t.MemberExpression>()
  })

  // estree types CallExpression's tag as `"CallExpression" | "NewExpression"`
  // (NewExpression extends CallExpressionBase without narrowing it); the
  // schema matches the precise tag, so the fixture intersects it.
  test('Should_AcceptEstreeCallExpression_When_TypedAsCallExpressionSchema', () => {
    expect<CallExpression>().type.toBeAssignableFrom<t.CallExpression & { type: 'CallExpression' }>()
  })

  test('Should_AcceptEstreeArrowFunctionExpression_When_TypedAsArrowFunctionExpressionSchema', () => {
    expect<ArrowFunctionExpression>().type.toBeAssignableFrom<t.ArrowFunctionExpression>()
  })

  test('Should_AcceptEstreeFunctionExpression_When_TypedAsFunctionExpressionSchema', () => {
    expect<FunctionExpression>().type.toBeAssignableFrom<t.FunctionExpression>()
  })

  test('Should_DiscriminateOnType_When_NodeTypeIsTheLiteralTag', () => {
    expect<Identifier['type']>().type.toBe<'Identifier'>()
    expect<CallExpression['type']>().type.toBe<'CallExpression'>()
    expect<MemberExpression['type']>().type.toBe<'MemberExpression'>()
  })
})

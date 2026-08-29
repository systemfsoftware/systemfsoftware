import type * as t from 'estree'
import { describe, expect, test } from 'tstyche'
import type {
  CallExpression,
  Identifier,
  MemberExpression,
  ObjectExpression,
  StringLiteral,
} from '../../../src/effect-schema-ignorer/AstNode.schema.js'

describe('AST node schemas are typed equivalently to estree nodes', () => {
  test('Should_AcceptEstreeIdentifier_When_TypedAsIdentifierSchema', () => {
    expect<Identifier>().type.toBeAssignableFrom<t.Identifier>()
  })

  test('Should_AcceptEstreeStringLiteral_When_TypedAsStringLiteralSchema', () => {
    expect<StringLiteral>().type.toBeAssignableFrom<t.Literal & { value: string }>()
  })

  test('Should_AcceptEstreeObjectExpression_When_TypedAsObjectExpressionSchema', () => {
    expect<ObjectExpression>().type.toBeAssignableFrom<t.ObjectExpression>()
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

  test('Should_DiscriminateOnType_When_NodeTypeIsTheLiteralTag', () => {
    expect<Identifier['type']>().type.toBe<'Identifier'>()
    expect<CallExpression['type']>().type.toBe<'CallExpression'>()
  })
})

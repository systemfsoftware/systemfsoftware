import { describe, it } from '@effect/vitest'
import { expect } from 'vitest'
import { type ObjectExpression, type StringLiteral } from '../ast-node.schema.js'
import { decideSchemaDeclarationIgnore, OPTIONAL_DEFAULT_IGNORED } from '../schema-declaration-ignore.js'
import { bareFactoryCall, callOf, memberOf } from './ast-node.fixtures.js'

describe('decideSchemaDeclarationIgnore — example cases', () => {
  it('Should_IgnoreTaggedArgs_When_FactoryIsBareIdentifier', () => {
    const tag: StringLiteral = { type: 'StringLiteral', value: 'someTag' }
    const fields: ObjectExpression = { type: 'ObjectExpression' }
    const tagResult = decideSchemaDeclarationIgnore(tag, bareFactoryCall('TaggedClass', tag, fields))
    const fieldsResult = decideSchemaDeclarationIgnore(fields, bareFactoryCall('TaggedClass', tag, fields))
    expect(tagResult).toBeUndefined()
    expect(fieldsResult).toBeUndefined()
  })

  it('Should_NotIgnore_When_ObjectIsNamedSymbolButPropertyIsNotFor', () => {
    const description: StringLiteral = { type: 'StringLiteral', value: 'desc' }
    expect(decideSchemaDeclarationIgnore(description, callOf(memberOf('Symbol', 'keyFor'), [description])))
      .toBeUndefined()
  })

  it('Should_NotIgnore_When_ObjectIsNotSymbolButPropertyIsFor', () => {
    const description: StringLiteral = { type: 'StringLiteral', value: 'desc' }
    expect(decideSchemaDeclarationIgnore(description, callOf(memberOf('Object', 'for'), [description]))).toBeUndefined()
  })

  it('Should_IgnoreOptionalWithDefault_When_ArgIsArrowFunction', () => {
    const defaultFn = { type: 'ArrowFunctionExpression' } as const
    const schemaArg = memberOf('S', 'String')
    const call = callOf(memberOf('S', 'optionalWith'), [schemaArg, defaultFn])
    expect(decideSchemaDeclarationIgnore(defaultFn, call)).toBe(OPTIONAL_DEFAULT_IGNORED)
  })

  it('Should_NotIgnoreOptionalWithDefault_When_ArgIsNotArrowFunction', () => {
    const notFn: StringLiteral = { type: 'StringLiteral', value: 'x' }
    const schemaArg = memberOf('S', 'String')
    const call = callOf(memberOf('S', 'optionalWith'), [schemaArg, notFn])
    expect(decideSchemaDeclarationIgnore(notFn, call)).toBeUndefined()
  })

  it('Should_NotIgnoreOptionalWithDefault_When_CalleeIsNotOptionalWith', () => {
    const defaultFn = { type: 'ArrowFunctionExpression' } as const
    const schemaArg = memberOf('S', 'String')
    const call = callOf(memberOf('S', 'optional'), [schemaArg, defaultFn])
    expect(decideSchemaDeclarationIgnore(defaultFn, call)).toBeUndefined()
  })
})

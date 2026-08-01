import { describe, it } from '@effect/vitest'
import { expect } from 'vitest'
import { type ObjectExpression, type StringLiteral } from '../ast-node.schema.js'
import {
  ANNOTATION_OBJECT_IGNORED,
  ANNOTATION_TEXT_IGNORED,
  decideSchemaDeclarationIgnore,
  OPTIONAL_DEFAULT_IGNORED,
} from '../schema-declaration-ignore.js'
import { annotationsCall, bareFactoryCall, callOf, memberOf, namedProperty, objectOf } from './ast-node.fixtures.js'

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

describe('decideSchemaDeclarationIgnore — annotations example cases', () => {
  const text = (value: string): StringLiteral => ({ type: 'StringLiteral', value })

  it('Should_IgnoreObjectAndValues_When_AnnotationsHoldOnlyDocumentation', () => {
    const documentation = objectOf([
      namedProperty('identifier', text('HexBytes')),
      namedProperty('description', text('Uint8Array encoded as a lowercase hex string')),
      namedProperty('title', text('Hex Bytes')),
    ])
    const call = annotationsCall(documentation)
    expect(decideSchemaDeclarationIgnore(documentation, call)).toBe(ANNOTATION_OBJECT_IGNORED)
    for (const property of documentation.properties) {
      expect(decideSchemaDeclarationIgnore(property.value, property, documentation, call))
        .toBe(ANNOTATION_TEXT_IGNORED)
    }
  })

  /**
   * `hex-string.schema.ts:13` — `identifier` beside an `arbitrary`. The object
   * keeps its mutants because emptying it drops the generator; the identifier
   * string does not, because no test can observe its value.
   */
  it('Should_IgnoreDocumentationOnly_When_AnnotationsAlsoCarryBehaviour', () => {
    const mixed = objectOf([
      namedProperty('arbitrary', { type: 'ArrowFunctionExpression' }),
      namedProperty('identifier', text('HexStringInput')),
    ])
    const call = annotationsCall(mixed)
    const [generator, documentation] = mixed.properties
    expect(decideSchemaDeclarationIgnore(mixed, call)).toBeUndefined()
    expect(decideSchemaDeclarationIgnore(generator?.value, generator, mixed, call)).toBeUndefined()
    expect(decideSchemaDeclarationIgnore(documentation?.value, documentation, mixed, call))
      .toBe(ANNOTATION_TEXT_IGNORED)
  })

  /**
   * `colon-hex.schema.ts:12` — emptying this object deletes the generator the
   * property tests draw from, so the mutant is a test gap and must survive.
   */
  it('Should_NotIgnore_When_AnnotationsCarryAnArbitrary', () => {
    const generator = objectOf([namedProperty('arbitrary', { type: 'ArrowFunctionExpression' })])
    expect(decideSchemaDeclarationIgnore(generator, annotationsCall(generator))).toBeUndefined()
  })

  it('Should_NotIgnore_When_AnnotationsObjectIsEmpty', () => {
    const empty = objectOf([])
    expect(decideSchemaDeclarationIgnore(empty, annotationsCall(empty))).toBeUndefined()
  })

  it('Should_NotIgnore_When_DocumentationObjectSitsAtAnotherArgument', () => {
    const documentation = objectOf([namedProperty('title', text('Hex Bytes'))])
    const call = callOf(memberOf('S', 'annotations'), [text('other'), documentation])
    expect(decideSchemaDeclarationIgnore(documentation, call)).toBeUndefined()
  })

  it('Should_NotIgnore_When_CalleeIsABareAnnotationsIdentifier', () => {
    const documentation = objectOf([namedProperty('title', text('Hex Bytes'))])
    const call = callOf({ type: 'Identifier', name: 'annotations' }, [documentation])
    expect(decideSchemaDeclarationIgnore(documentation, call)).toBeUndefined()
  })
})

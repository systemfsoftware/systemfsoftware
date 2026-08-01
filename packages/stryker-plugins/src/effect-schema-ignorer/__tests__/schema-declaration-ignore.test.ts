import { describe, it } from '@effect/vitest'
import { expect } from 'vitest'
import { type AstNode, type ObjectExpression, type StringLiteral } from '../ast-node.schema.js'
import {
  ANNOTATION_OBJECT_IGNORED,
  ANNOTATION_TEXT_IGNORED,
  decideSchemaDeclarationIgnore,
  OPTIONAL_DEFAULT_IGNORED,
  TEMPLATE_HEAD_IGNORED,
} from '../schema-declaration-ignore.js'
import {
  annotationsCall,
  bareFactoryCall,
  callOf,
  identifier,
  memberOf,
  memberOfNode,
  namedProperty,
  objectOf,
  patternCall,
  regExpLiteral,
  stringLiteral,
} from './ast-node.fixtures.js'

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

describe('decideSchemaDeclarationIgnore — TemplateLiteral head', () => {
  const HEAD = 'usr'
  const forcingRegex = regExpLiteral('^usr[a-z]*$')
  const tailSpan = stringLiteral('end')

  interface Tree {
    readonly node: AstNode
    readonly parent: AstNode
    readonly grandparent: AstNode
    readonly ancestor: AstNode
  }

  interface TreeOptions {
    readonly head?: AstNode
    readonly extraSpans?: ReadonlyArray<AstNode>
    readonly target?: AstNode
    readonly factory?: AstNode
    readonly memberObject?: AstNode
    readonly member?: string
    readonly ancestorCallee?: AstNode
    readonly steps?: ReadonlyArray<AstNode>
  }

  /** `<factory>(...spans).<member>(...steps)`, defaulting to the shape the rule accepts. */
  const treeOf = (options: TreeOptions = {}): Tree => {
    const head = options.head ?? stringLiteral(HEAD)
    const parent = callOf(options.factory ?? memberOf('S', 'TemplateLiteral'), [head, ...options.extraSpans ?? []])
    const grandparent = memberOfNode(options.memberObject ?? parent, options.member ?? 'pipe')
    const ancestor = callOf(options.ancestorCallee ?? grandparent, options.steps ?? [patternCall(forcingRegex)])
    return { node: options.target ?? head, parent, grandparent, ancestor }
  }

  const decide = ({ node, parent, grandparent, ancestor }: Tree): string | undefined =>
    decideSchemaDeclarationIgnore(node, parent, grandparent, ancestor)

  it.each([
    { case: 'the regex anchors exactly the head', pattern: '^usr[a-z]*$', flags: '', ignored: true },
    { case: 'a + still forces the final character', pattern: '^usr+$', flags: '', ignored: true },
    { case: 'the regex is unanchored', pattern: 'usr[a-z]*$', flags: '', ignored: false },
    { case: 'the regex anchors a different prefix', pattern: '^abc[a-z]*$', flags: '', ignored: false },
    { case: 'a ? makes the final character optional', pattern: '^usr?[a-z]*$', flags: '', ignored: false },
    { case: 'a * makes the final character optional', pattern: '^usr*[a-z]*$', flags: '', ignored: false },
    { case: 'a { makes the final character optional', pattern: '^usr{0,2}$', flags: '', ignored: false },
    { case: 'the i flag admits another casing', pattern: '^usr[a-z]*$', flags: 'i', ignored: false },
    { case: 'the m flag lets ^ match a line start', pattern: '^usr[a-z]*$', flags: 'm', ignored: false },
  ])('Should_DecideByRegex_When_$case', ({ pattern, flags, ignored }) => {
    const decision = decide(treeOf({ steps: [patternCall(regExpLiteral(pattern, flags))] }))
    expect(decision).toBe(ignored ? TEMPLATE_HEAD_IGNORED : undefined)
  })

  it.each([
    { case: 'the pipe applies a forcing pattern', tree: treeOf(), ignored: true },
    {
      case: 'the pattern carries annotations beside the regex',
      tree: treeOf({
        steps: [
          callOf(memberOf('S', 'pattern'), [forcingRegex, objectOf([namedProperty('title', stringLiteral('W'))])]),
        ],
      }),
      ignored: true,
    },
    { case: 'the pipe carries no pattern at all', tree: treeOf({ steps: [] }), ignored: false },
    {
      case: 'the step is a filter rather than a pattern',
      tree: treeOf({ steps: [callOf(memberOf('S', 'filter'), [forcingRegex])] }),
      ignored: false,
    },
    {
      case: 'the pattern argument is not a regex literal',
      tree: treeOf({ steps: [patternCall(stringLiteral('^usr'))] }),
      ignored: false,
    },
    {
      case: 'the head carries regex metacharacters',
      tree: treeOf({ head: stringLiteral('a.b'), steps: [patternCall(regExpLiteral('^a.b$'))] }),
      ignored: false,
    },
    {
      case: 'the span sits past the head',
      tree: treeOf({
        extraSpans: [tailSpan],
        target: tailSpan,
        steps: [patternCall(regExpLiteral('^usrend$'))],
      }),
      ignored: false,
    },
    {
      case: 'the factory is a bare identifier',
      tree: treeOf({ factory: identifier('TemplateLiteral') }),
      ignored: false,
    },
    { case: 'the factory is not TemplateLiteral', tree: treeOf({ factory: memberOf('S', 'Literal') }), ignored: false },
    { case: 'the member on the template is not pipe', tree: treeOf({ member: 'annotations' }), ignored: false },
    { case: 'the pipe belongs to another object', tree: treeOf({ memberObject: identifier('Other') }), ignored: false },
    {
      case: 'the ancestor calls something other than the pipe',
      tree: treeOf({ ancestorCallee: memberOf('S', 'compose') }),
      ignored: false,
    },
  ])('Should_DecideByShape_When_$case', ({ tree, ignored }) => {
    expect(decide(tree)).toBe(ignored ? TEMPLATE_HEAD_IGNORED : undefined)
  })
})

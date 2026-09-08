import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import {
  EFFECT_METHOD_ACTUAL,
  EFFECT_METHOD_EXPECTED,
  EFFECT_METHOD_FIX,
  meta,
} from './no-effect-returning-schema-method.config.js'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'

export type MessageIds = 'effectReturningMethod'

type GetScope = (node: ESTree.Node) => unknown

const vocabularyMemberOf = (node: ESTree.Node, getScope: GetScope): string | null => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin === null || !isSchemaVocabularyOrigin(origin)) return null
  return originFinalMember(origin) ?? null
}

const SCHEMA_CLASS_BASES: Readonly<Record<string, true>> = {
  Class: true,
  TaggedClass: true,
  TaggedError: true,
  Struct: true,
}

type ExpressionWrapperNode = ESTree.Node & { readonly expression: ESTree.Node }

const isExpressionWrapper = (node: ESTree.Node): node is ExpressionWrapperNode =>
  node.type === 'TSAsExpression' ||
  node.type === 'TSSatisfiesExpression' ||
  node.type === 'TSNonNullExpression' ||
  node.type === 'TSTypeAssertion' ||
  node.type === 'TSInstantiationExpression'

const unwrapWrappers = (node: ESTree.Node): ESTree.Node => {
  let current = node
  while (isExpressionWrapper(current)) current = current.expression
  return current
}

const schemaBaseOf = (superClass: ESTree.Node, getScope: GetScope): string | null => {
  let current = unwrapWrappers(superClass)
  let depth = 0
  while (current.type === 'CallExpression') {
    if (depth > 16) return null
    depth += 1
    current = unwrapWrappers(current.callee)
  }
  return vocabularyMemberOf(current, getScope)
}

const isSchemaSuperClass = (superClass: ESTree.Node, getScope: GetScope): boolean => {
  const base = schemaBaseOf(superClass, getScope)
  return base !== null && SCHEMA_CLASS_BASES[base] === true
}

const isSchemaClass = (node: ESTree.Class, getScope: GetScope): boolean => {
  const superClass = node.superClass
  if (superClass === null) return false
  return isSchemaSuperClass(superClass, getScope)
}

const EFFECT_TYPE_NAMES: Readonly<Record<string, true>> = {
  Effect: true,
  Promise: true,
}

const mentionsInTypeName = (node: ESTree.TSTypeName): boolean => {
  if (node.type === 'Identifier') return EFFECT_TYPE_NAMES[node.name] === true
  if (node.type === 'ThisExpression') return false
  return EFFECT_TYPE_NAMES[node.right.name] === true || mentionsInTypeName(node.left)
}

const mentionsInTupleElement = (node: ESTree.TSTupleElement): boolean => {
  switch (node.type) {
    case 'TSNamedTupleMember':
      return mentionsInTupleElement(node.elementType)
    case 'TSOptionalType':
    case 'TSRestType':
      return mentionsInType(node.typeAnnotation)
    default:
      return mentionsInType(node)
  }
}

const mentionsInType = (node: ESTree.TSType): boolean => {
  switch (node.type) {
    case 'TSTypeReference': {
      const args = node.typeArguments
      return mentionsInTypeName(node.typeName) || (args !== null && args.params.some(mentionsInType))
    }
    case 'TSUnionType':
    case 'TSIntersectionType':
      return node.types.some(mentionsInType)
    case 'TSArrayType':
      return mentionsInType(node.elementType)
    case 'TSTupleType':
      return node.elementTypes.some(mentionsInTupleElement)
    case 'TSFunctionType':
    case 'TSConstructorType':
      return mentionsInType(node.returnType.typeAnnotation)
    case 'TSTemplateLiteralType':
      return node.types.some(mentionsInType)
    case 'TSIndexedAccessType':
      return mentionsInType(node.objectType) || mentionsInType(node.indexType)
    case 'TSConditionalType':
      return (
        mentionsInType(node.checkType) ||
        mentionsInType(node.extendsType) ||
        mentionsInType(node.trueType) ||
        mentionsInType(node.falseType)
      )
    case 'TSMappedType': {
      const annotation = node.typeAnnotation
      return (
        mentionsInType(node.constraint) ||
        (annotation !== null && mentionsInType(annotation))
      )
    }
    default:
      return false
  }
}

type MethodFunction = ESTree.MethodDefinition['value'] | ESTree.ArrowFunctionExpression

const isEffectReturning = (fn: MethodFunction): boolean => {
  if (fn.async === true) return true
  const returnType = fn.returnType
  if (returnType === undefined || returnType === null) return false
  return mentionsInType(returnType.typeAnnotation)
}

export const noEffectReturningSchemaMethod = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    const report = (node: ESTree.Node, name: string): void => {
      context.report({
        node,
        messageId: 'effectReturningMethod',
        data: {
          name,
          expected: EFFECT_METHOD_EXPECTED,
          actual: EFFECT_METHOD_ACTUAL,
          fix: EFFECT_METHOD_FIX,
        },
      })
    }
    const methodNameOf = (node: ESTree.MethodDefinition | ESTree.PropertyDefinition): string => {
      const key = node.key
      if (key.type === 'Identifier') return `method ${key.name}`
      if (key.type === 'Literal' && typeof key.value === 'string') return `method ${key.value}`
      return 'a method'
    }
    const ownerIsSchemaClass = (node: ESTree.MethodDefinition | ESTree.PropertyDefinition): boolean => {
      const parent = node.parent
      if (parent === null || parent.type !== 'ClassBody') return false
      const owner = parent.parent
      if (owner === null) return false
      if (owner.type !== 'ClassDeclaration' && owner.type !== 'ClassExpression') return false
      return isSchemaClass(owner, getScope)
    }
    return {
      MethodDefinition(node: ESTree.MethodDefinition) {
        if (!ownerIsSchemaClass(node)) return
        if (isEffectReturning(node.value)) report(node, `${methodNameOf(node)} that builds an effect`)
      },
      PropertyDefinition(node: ESTree.PropertyDefinition) {
        if (!ownerIsSchemaClass(node)) return
        const value = node.value
        if (value === null) return
        if (value.type !== 'ArrowFunctionExpression' && value.type !== 'FunctionExpression') return
        if (isEffectReturning(value)) {
          report(node, `${methodNameOf(node)} that builds an effect`)
        }
      },
    }
  },
})

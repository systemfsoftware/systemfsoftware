import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import {
  FIELD_MUTATION_ACTUAL,
  FIELD_MUTATION_EXPECTED,
  FIELD_MUTATION_FIX,
  meta,
} from './no-schema-field-mutation.config.js'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'

export type MessageIds = 'schemaFieldMutation'

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

const fieldNameOf = (node: ESTree.MemberExpression): string => {
  const property = node.property
  if (!node.computed && property.type === 'Identifier') return property.name
  if (property.type === 'Literal' && typeof property.value === 'string') return property.value
  if (property.type === 'PrivateIdentifier') return `#${property.name}`
  return 'a field'
}

export const noSchemaFieldMutation = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    return {
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        const left = node.left
        if (left.type !== 'MemberExpression') return
        if (left.object.type !== 'ThisExpression') return
        let current = node.parent
        let seenFunction = false
        while (current !== null) {
          if (current.type === 'FunctionExpression' || current.type === 'ArrowFunctionExpression') {
            seenFunction = true
          }
          if (current.type === 'MethodDefinition') {
            if (!seenFunction) return
            break
          }
          if (current.type === 'PropertyDefinition') {
            if (!seenFunction) return
            break
          }
          if (current.type === 'ClassBody' || current.type === 'Program') break
          current = current.parent
        }
        if (current === null || current.type === 'Program') return
        const enclosing = current
        if (enclosing.type !== 'MethodDefinition' && enclosing.type !== 'PropertyDefinition') return
        const classBody = enclosing.parent
        if (classBody === null || classBody.type !== 'ClassBody') return
        const owner = classBody.parent
        if (owner === null) return
        if (owner.type !== 'ClassDeclaration' && owner.type !== 'ClassExpression') return
        if (!isSchemaClass(owner, getScope)) return
        context.report({
          node,
          messageId: 'schemaFieldMutation',
          data: {
            name: `an assignment to this.${fieldNameOf(left)} in a method`,
            expected: FIELD_MUTATION_EXPECTED,
            actual: FIELD_MUTATION_ACTUAL,
            fix: FIELD_MUTATION_FIX,
          },
        })
      },
    }
  },
})

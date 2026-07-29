import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  EITHER_TYPE_NAME,
  LEFT_CONSTRUCTOR,
  meta,
  Options,
  TAGGED_CLASS_NAMES,
  TAGGED_ERROR_NAME,
  UNINHABITED_KINDS,
  WORKFLOW_SUFFIX,
} from './workflow-either-inhabited.config.js'

export type MessageIds = 'uninhabitedErrorChannel' | 'uninhabitedDecisionChannel' | 'plainErrorChannel'

type PendingExport = { readonly node: ESTree.Node; readonly either: ESTree.TSTypeReference; readonly name: string }
type PendingLeft = { readonly node: ESTree.Node; readonly constructed: string }

const eitherReference = (annotation: ESTree.Node | undefined | null): ESTree.TSTypeReference | null => {
  if (annotation === undefined || annotation === null) return null
  if (annotation.type !== 'TSTypeAnnotation') return null
  const declared = annotation.typeAnnotation
  if (declared.type !== 'TSTypeReference') return null
  const typeName = declared.typeName
  if (typeName.type === 'Identifier') return typeName.name === EITHER_TYPE_NAME ? declared : null
  if (typeName.type !== 'TSQualifiedName') return null
  return typeName.right.name === EITHER_TYPE_NAME ? declared : null
}

const taggedName = (node: ESTree.Class): string | null => {
  const heritage = node.superClass
  if (heritage?.type !== 'CallExpression') return null
  const outer = heritage.callee
  if (outer.type !== 'CallExpression') return null
  const inner = outer.callee
  if (inner.type === 'Identifier') return inner.name
  if (inner.type !== 'MemberExpression') return null
  return inner.property.type === 'Identifier' ? inner.property.name : null
}

const taggedConstructor = (node: ESTree.Class): ESTree.CallExpression | null => {
  const name = taggedName(node)
  if (name === null || !TAGGED_CLASS_NAMES.includes(name)) return null
  return node.superClass?.type === 'CallExpression' ? node.superClass : null
}

const isTaggedError = (node: ESTree.Class): boolean => taggedName(node) === TAGGED_ERROR_NAME

const carriesNoFields = (constructor: ESTree.CallExpression): boolean => {
  const fields = constructor.arguments[1]
  if (fields === undefined) return true
  if (fields.type !== 'ObjectExpression') return false
  return fields.properties.length === 0
}

const referencedName = (node: ESTree.Node | undefined): string | null => {
  if (node?.type !== 'TSTypeReference') return null
  const typeName = node.typeName
  if (typeName.type === 'Identifier') return typeName.name
  if (typeName.type !== 'TSQualifiedName') return null
  return typeName.right.name
}

const keywordLabel = (node: ESTree.Node): string => node.type.replace('TS', '').replace('Keyword', '').toLowerCase()

export const workflowEitherInhabited = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(WORKFLOW_SUFFIX)) return {}

    const untaggedClasses = new Set<string>()
    const payloadFreeClasses = new Set<string>()
    const exports: PendingExport[] = []
    const lefts: PendingLeft[] = []

    const reportErrorChannel = ({ either, name, node }: PendingExport): void => {
      const params = either.typeArguments?.params
      const error = params?.[1]
      if (error !== undefined && !UNINHABITED_KINDS.includes(error.type)) return
      context.report({
        node,
        messageId: 'uninhabitedErrorChannel',
        data: {
          name: `The error channel of ${name}`,
          expected: 'an inhabited S.TaggedError variant',
          actual: error === undefined
            ? 'an unparameterized Either'
            : `${keywordLabel(error)}, which declares no domain error`,
          fix:
            'name the domain error the consumer aborts on and declare it as an S.TaggedError; if the decision is total, drop the Either and return the bare union so the tag carries the choice',
        },
      })
    }

    const reportDecisionChannel = ({ either, name, node }: PendingExport): void => {
      const decision = either.typeArguments?.params[0]
      if (decision === undefined) return
      const referenced = referencedName(decision)
      const unit = referenced !== null && payloadFreeClasses.has(referenced)
      if (!unit && !UNINHABITED_KINDS.includes(decision.type)) return
      context.report({
        node,
        messageId: 'uninhabitedDecisionChannel',
        data: {
          name: `The decision channel of ${name}`,
          expected: 'a decision that carries information — two or more variants, or one variant with fields',
          actual: unit ? `${referenced}, a single variant with no fields` : keywordLabel(decision),
          fix:
            'an Either whose decision channel is a unit is Option<Error> in disguise; return Option<Error>, or return the bare union so the tag carries the choice',
        },
      })
    }

    return {
      ClassDeclaration(node: ESTree.Class) {
        const name = context.sourceCode.getText(node.id)
        const constructor = taggedConstructor(node)
        if (constructor !== null && carriesNoFields(constructor)) payloadFreeClasses.add(name)
        if (isTaggedError(node)) return
        untaggedClasses.add(name)
      },

      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        if (callee.property.type !== 'Identifier') return
        if (callee.property.name !== LEFT_CONSTRUCTOR) return
        const argument = node.arguments[0]
        if (argument?.type !== 'NewExpression') return
        if (argument.callee.type !== 'Identifier') return
        lefts.push({ node, constructed: argument.callee.name })
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration

        if (declaration?.type === 'FunctionDeclaration') {
          const either = eitherReference(declaration.returnType)
          if (either === null) return
          exports.push({ node: declaration, either, name: context.sourceCode.getText(declaration.id) })
          return
        }

        if (declaration?.type !== 'VariableDeclaration') return
        for (const declarator of declaration.declarations) {
          const init = declarator.init
          if (init?.type !== 'ArrowFunctionExpression' && init?.type !== 'FunctionExpression') continue
          const either = eitherReference(init.returnType)
          if (either === null) continue
          exports.push({ node: declarator, either, name: context.sourceCode.getText(declarator.id) })
        }
      },

      'Program:exit'() {
        for (const pending of exports) {
          reportErrorChannel(pending)
          reportDecisionChannel(pending)
        }
        for (const { constructed, node } of lefts) {
          const plain = constructed === 'Error'
          if (!plain && !untaggedClasses.has(constructed)) continue
          context.report({
            node,
            messageId: 'plainErrorChannel',
            data: {
              name: `The value passed to Either.left (${constructed})`,
              expected: 'an S.TaggedError declared in this workflow',
              actual: plain ? 'a plain JavaScript Error' : `${constructed}, which does not extend S.TaggedError`,
              fix:
                `declare ${constructed} as class ${constructed} extends S.TaggedError<${constructed}>()('${constructed}', { ... }) so the error carries a tag the consumer can dispatch on`,
            },
          })
        }
      },
    }
  },
})

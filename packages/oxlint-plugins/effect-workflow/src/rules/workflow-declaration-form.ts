import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  FUNCTION_DECLARATION_ACTUAL,
  FUNCTION_DECLARATION_EXPECTED,
  FUNCTION_DECLARATION_FIX,
  meta,
  MISSING_ANNOTATION_ACTUAL,
  MISSING_ANNOTATION_EXPECTED,
  MISSING_ANNOTATION_FIX,
  WORKFLOW_TYPE_NAME,
  WRONG_ANNOTATION_ACTUAL,
  WRONG_ANNOTATION_EXPECTED,
  WRONG_ANNOTATION_FIX,
} from './workflow-declaration-form.config.js'

export type MessageIds = 'functionDeclaration' | 'missingAnnotation' | 'wrongAnnotation'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isBehaviourInit = (init: ESTree.Node | null | undefined): boolean =>
  init?.type === 'ArrowFunctionExpression' ||
  init?.type === 'FunctionExpression' ||
  init?.type === 'CallExpression'

const annotationTypeName = (id: ESTree.Node): string | null | undefined => {
  if (!('typeAnnotation' in id)) return undefined
  const annotation = id.typeAnnotation
  if (annotation == null) return undefined
  if (!('typeAnnotation' in annotation)) return undefined
  const inner = annotation.typeAnnotation
  if (inner == null) return undefined
  if (!('typeName' in inner)) return null
  const named = inner.typeName
  if (!('name' in named)) return null
  return named.name
}

export const workflowDeclarationForm = defineRule({
  meta,
  create(context: Context) {
    if (!isWorkflowFile(context.filename)) return {}

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration
        if (declaration == null) return

        if (declaration.type === 'FunctionDeclaration') {
          context.report({
            node: declaration,
            messageId: 'functionDeclaration',
            data: {
              name: declaration.id?.name ?? 'the exported function',
              expected: FUNCTION_DECLARATION_EXPECTED,
              actual: FUNCTION_DECLARATION_ACTUAL,
              fix: FUNCTION_DECLARATION_FIX,
            },
          })
          return
        }

        if (declaration.type !== 'VariableDeclaration') return

        for (const declarator of declaration.declarations) {
          if (!isBehaviourInit(declarator.init)) continue
          if (declarator.id.type !== 'Identifier') continue

          const name = declarator.id.name
          const typeName = annotationTypeName(declarator.id)

          if (typeName === undefined) {
            context.report({
              node: declarator.id,
              messageId: 'missingAnnotation',
              data: {
                name,
                expected: MISSING_ANNOTATION_EXPECTED,
                actual: MISSING_ANNOTATION_ACTUAL,
                fix: MISSING_ANNOTATION_FIX,
              },
            })
            continue
          }

          if (typeName !== WORKFLOW_TYPE_NAME) {
            context.report({
              node: declarator.id,
              messageId: 'wrongAnnotation',
              data: {
                name,
                expected: WRONG_ANNOTATION_EXPECTED,
                actual: WRONG_ANNOTATION_ACTUAL,
                fix: WRONG_ANNOTATION_FIX,
              },
            })
          }
        }
      },
    }
  },
})

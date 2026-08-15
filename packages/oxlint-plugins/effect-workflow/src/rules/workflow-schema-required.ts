import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { getExportedWorkflowFunction, workflowFunctionInit } from './exported-workflow-fn.js'
import { EITHER_TYPE_NAME, meta, WORKFLOW_SUFFIX } from './workflow-schema-required.config.js'

export type MessageIds = 'noSchemaVariants' | 'missingErrorChannel'

const WorkflowFileName = S.NonEmptyArray(S.String)

const getWorkflowBaseName = (filename: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(WorkflowFileName)(filename.split('/')))

type SchemaVariantKind = 'decision' | 'error'

const schemaVariantKind = (node: ESTree.CallExpression): SchemaVariantKind | null => {
  const callee = node.callee.type === 'CallExpression' ? node.callee.callee : node.callee
  if (callee.type !== 'MemberExpression') return null
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return null
  if (callee.property.type !== 'Identifier') return null
  if (callee.property.name === 'TaggedClass') return 'decision'
  if (callee.property.name === 'TaggedError') return 'error'
  return null
}

const eitherReference = (annotation: ESTree.Node | null | undefined): ESTree.TSTypeReference | null => {
  if (annotation === undefined || annotation === null) return null
  if (annotation.type !== 'TSTypeAnnotation') return null
  const declared = annotation.typeAnnotation
  if (declared.type !== 'TSTypeReference') return null
  const typeName = declared.typeName
  if (typeName.type === 'Identifier') return typeName.name === EITHER_TYPE_NAME ? declared : null
  if (typeName.type !== 'TSQualifiedName') return null
  return typeName.right.name === EITHER_TYPE_NAME ? declared : null
}

const returnTypeOf = (fn: ESTree.Node): ESTree.TSTypeAnnotation | null | undefined => {
  if (fn.type === 'FunctionDeclaration') return fn.returnType
  if (fn.type !== 'VariableDeclarator') return undefined
  const inner = workflowFunctionInit(fn)
  if (inner === undefined) return undefined
  if (inner.type !== 'ArrowFunctionExpression' && inner.type !== 'FunctionExpression') return undefined
  return inner.returnType
}

const errorArgumentBackedByDeclaredError = (type: ESTree.TSType, errorVariantNames: string[]): boolean => {
  if (type.type === 'TSTypeReference') {
    const typeName = type.typeName
    if (typeName.type === 'Identifier') return errorVariantNames.includes(typeName.name)
    if (typeName.type === 'TSQualifiedName') return errorVariantNames.includes(typeName.right.name)
  }
  if (type.type === 'TSUnionType') {
    return type.types.some((t) => errorArgumentBackedByDeclaredError(t, errorVariantNames))
  }
  return false
}

const returnTypeLabel = (annotation: ESTree.TSTypeAnnotation | null | undefined): string => {
  if (annotation === undefined || annotation === null) return 'no declared return type'
  const declared = annotation.typeAnnotation
  if (declared.type === 'TSTypeReference') {
    const typeName = declared.typeName
    if (typeName.type === 'Identifier') return typeName.name
    if (typeName.type === 'TSQualifiedName') return typeName.right.name
  }
  if (declared.type === 'TSUnionType') return 'a bare union'
  return declared.type
}

const missingErrorChannelActual = (
  exportedFunctions: ESTree.Node[],
  errorVariantNames: string[],
): string | null => {
  for (const fn of exportedFunctions) {
    const returnType = returnTypeOf(fn)
    const either = eitherReference(returnType)
    if (either === null) {
      return `the exported function returns ${returnTypeLabel(returnType)} instead of an Either`
    }
    const errorArgument = either.typeArguments?.params[1]
    if (errorArgument === undefined) {
      return 'an Either whose error type references no declared S.TaggedError'
    }
    const backed = errorArgumentBackedByDeclaredError(errorArgument, errorVariantNames)
    if (!backed) {
      return 'an Either whose error type references no declared S.TaggedError'
    }
  }
  if (errorVariantNames.length === 0) return 'no S.TaggedError declaration'
  return null
}

export const workflowSchemaRequired = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(WORKFLOW_SUFFIX)) return {}

    const baseName = getWorkflowBaseName(context.filename)
    const variantNames: string[] = []
    const errorVariantNames: string[] = []
    const exportedFunctions: ESTree.Node[] = []

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (!node.superClass) return
        if (node.superClass.type !== 'CallExpression') return
        const kind = schemaVariantKind(node.superClass)
        if (kind === null) return
        if (node.id === null) return
        variantNames.push(node.id.name)
        if (kind === 'error') errorVariantNames.push(node.id.name)
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const fn = getExportedWorkflowFunction(node)
        if (fn !== undefined) exportedFunctions.push(fn)
      },

      'Program:exit'(node: ESTree.Program) {
        const reportNode = node.body[0] ?? node

        if (variantNames.length === 0) {
          context.report({
            node: reportNode,
            messageId: 'noSchemaVariants',
            data: {
              name: baseName,
              expected: 'Command, Decision, and Error declared as S.TaggedClass / S.TaggedError',
              actual: 'no S.TaggedClass or S.TaggedError declaration',
              fix:
                'declare the command, decision variants, and any error as S.TaggedClass/S.TaggedError with their TypeId, or rename the file if it is not a workflow',
            },
          })
          return
        }

        const missingErrorActual = missingErrorChannelActual(exportedFunctions, errorVariantNames)
        if (missingErrorActual !== null) {
          context.report({
            node: reportNode,
            messageId: 'missingErrorChannel',
            data: {
              name: baseName,
              expected:
                'an exported function returning Either.Either<Decision, Error> with a declared S.TaggedError error type',
              actual: missingErrorActual,
              fix:
                'if the decision is total, relocate the file out of *.workflow.ts — a bare union is not a workflow; do not invent an S.TaggedError to satisfy this rule',
            },
          })
        }
      },
    }
  },
})

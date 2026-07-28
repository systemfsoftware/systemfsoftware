import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { getExportedWorkflowFunction } from './exported-workflow-fn.js'
import { COMMAND_TYPE_NODE, meta } from './workflow-command-object.config.js'

export type MessageIds = 'commandArity' | 'untypedCommand' | 'notCommandObject'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const getFunctionNode = (exported: ESTree.Node): ESTree.Node | undefined => {
  if (exported.type === 'FunctionDeclaration') return exported
  if (exported.type !== 'VariableDeclarator') return undefined
  const init = exported.init
  if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') return init
  return undefined
}

const getParams = (node: ESTree.Node): ESTree.Node[] | undefined => {
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  ) {
    return node.params
  }
  return undefined
}

const commandAnnotationKind = (param: ESTree.Node): string | undefined => {
  const target = param.type === 'AssignmentPattern' ? param.left : param
  if (!('typeAnnotation' in target)) return undefined
  const annotation = target.typeAnnotation
  if (annotation == null) return undefined
  if (!('typeAnnotation' in annotation)) return undefined
  const inner = annotation.typeAnnotation
  if (inner == null) return undefined
  return inner.type
}

export const workflowCommandObject = defineRule({
  meta,
  create(context: Context) {
    if (!isWorkflowFile(context.filename)) return {}

    const exportedFunctions: ESTree.Node[] = []

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const exported = getExportedWorkflowFunction(node)
        if (exported !== undefined) exportedFunctions.push(exported)
      },
      'Program:exit'() {
        const exported = exportedFunctions[0]
        if (exported === undefined) return
        const fn = getFunctionNode(exported)
        if (fn === undefined) return
        const params = getParams(fn)
        if (params === undefined) return

        if (params.length !== 1) {
          context.report({
            node: exported,
            messageId: 'commandArity',
            data: {
              name: 'exported workflow function',
              expected: 'exactly one type-annotated command object parameter',
              actual: `${params.length} parameters`,
              fix: 'replace positional parameters with one command object declared inline in the workflow',
            },
          })
          return
        }

        const command = params[0]
        if (command === undefined) return
        const kind = commandAnnotationKind(command)

        if (kind === undefined) {
          context.report({
            node: command,
            messageId: 'untypedCommand',
            data: {
              name: 'workflow command parameter',
              expected: 'a TypeScript type annotation naming the command object',
              actual: 'no type annotation',
              fix: 'annotate the parameter with the inline S.TaggedClass command type',
            },
          })
          return
        }

        if (kind !== COMMAND_TYPE_NODE) {
          context.report({
            node: command,
            messageId: 'notCommandObject',
            data: {
              name: 'workflow command parameter',
              expected: `a named command object type (${COMMAND_TYPE_NODE})`,
              actual: kind,
              fix: 'declare an inline S.TaggedClass command carrying its TypeId and annotate the parameter with it',
            },
          })
        }
      },
    }
  },
})

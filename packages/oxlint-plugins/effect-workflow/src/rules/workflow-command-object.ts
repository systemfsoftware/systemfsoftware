import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { getExportedWorkflowFunction, workflowFunctionInit } from './exported-workflow-fn.js'
import { COMMAND_TYPE_NODE, meta } from './workflow-command-object.config.js'

export type MessageIds = 'commandArity' | 'untypedCommand' | 'notCommandObject' | 'commandNotTaggedClass'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const getFunctionNode = (exported: ESTree.Node): ESTree.Node | undefined => {
  if (exported.type === 'FunctionDeclaration') return exported
  if (exported.type !== 'VariableDeclarator') return undefined
  return workflowFunctionInit(exported)
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

const commandAnnotation = (param: ESTree.Node): ESTree.Node | undefined => {
  const target = param.type === 'AssignmentPattern' ? param.left : param
  if (!('typeAnnotation' in target)) return undefined
  const annotation = target.typeAnnotation
  if (annotation == null) return undefined
  if (!('typeAnnotation' in annotation)) return undefined
  const inner = annotation.typeAnnotation
  if (inner == null) return undefined
  return inner
}

const referencedTypeName = (annotation: ESTree.Node): string | undefined => {
  if (!('typeName' in annotation)) return undefined
  const named = annotation.typeName
  if (!('name' in named)) return undefined
  return named.name
}

export const workflowCommandObject = defineRule({
  meta,
  create(context: Context) {
    if (!isWorkflowFile(context.filename)) return {}

    const exportedFunctions: ESTree.Node[] = []
    const localAliasNames = new Set<string>()

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const exported = getExportedWorkflowFunction(node)
        if (exported !== undefined) exportedFunctions.push(exported)
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type !== 'Identifier') return
        localAliasNames.add(node.id.name)
      },
      TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
        localAliasNames.add(node.id.name)
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
        const annotation = commandAnnotation(command)

        if (annotation === undefined) {
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

        if (annotation.type !== COMMAND_TYPE_NODE) {
          context.report({
            node: command,
            messageId: 'notCommandObject',
            data: {
              name: 'workflow command parameter',
              expected: `a named command object type (${COMMAND_TYPE_NODE})`,
              actual: annotation.type,
              fix: 'declare an inline S.TaggedClass command carrying its TypeId and annotate the parameter with it',
            },
          })
          return
        }

        const referenced = referencedTypeName(annotation)
        if (referenced === undefined) return
        if (!localAliasNames.has(referenced)) return

        context.report({
          node: command,
          messageId: 'commandNotTaggedClass',
          data: {
            name: referenced,
            expected: 'the command declared as a class extending S.TaggedClass',
            actual: `${referenced} is declared locally as a schema value or type alias`,
            fix: 'replace the S.Struct declaration with a class extending S.TaggedClass that carries its TypeId',
          },
        })
      },
    }
  },
})

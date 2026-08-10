import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { meta, WORKFLOW_SUFFIX } from './workflow-inline-schemas.config.js'

export type MessageIds = 'singleConsumerSchema'

const isWorkflowFile = (filename: string): boolean => filename.endsWith(WORKFLOW_SUFFIX)

const WorkflowFileName = S.NonEmptyArray(S.String)

const getWorkflowBaseName = (filename: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(WorkflowFileName)(filename.split('/'))).slice(0, -WORKFLOW_SUFFIX.length)

const SCHEMA_IMPORT = /\/([^/]+)\.schema\.(?:ts|js)$/

const isSingleConsumerSchemaImport = (source: string, workflowBase: string): boolean =>
  SCHEMA_IMPORT.exec(source)?.[1] === workflowBase

export const workflowInlineSchemas = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}
    const workflowBase = getWorkflowBaseName(filename)

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (!isSingleConsumerSchemaImport(source, workflowBase)) return

        context.report({
          node,
          messageId: 'singleConsumerSchema',
          data: {
            name: source,
            expected: 'types consumed by exactly one workflow to be declared in the workflow file',
            actual: `importing ${source} from ${filename.split('/').at(-1) ?? filename}`,
            fix: 'move the declarations inline or rename the schema file if it is shared',
          },
        })
      },
    }
  },
})

import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { basenameOf } from './path.js'
import { isPropCallee } from './prop-call.js'
import {
  FOREIGN_SUBJECT_EXPECTED,
  FOREIGN_SUBJECT_FIX,
  FOREIGN_SUBJECT_NAME,
  LOCAL_SUBJECT_EXPECTED,
  LOCAL_SUBJECT_FIX,
  LOCAL_SUBJECT_NAME,
  meta,
  WORKFLOW_PROPERTY_SUFFIX,
} from './workflow-property-subject.config.js'

export type MessageIds = 'localSubject' | 'foreignSubject'

const WORKFLOW_MODULE = /\.workflow(\.[cm]?[jt]sx?)?$/

const isWorkflowSpecifier = (source: string): boolean => WORKFLOW_MODULE.test(source.slice(source.lastIndexOf('/') + 1))

const rootNameOf = (node: ESTree.Node): string | undefined => {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression' && !node.computed) return rootNameOf(node.object)
  return undefined
}

const subjectOf = (call: ESTree.CallExpression): ESTree.Node | undefined => {
  for (const arg of call.arguments) {
    if (arg.type !== 'ObjectExpression') continue
    for (const property of arg.properties) {
      if (
        property.type === 'Property' && !property.computed && property.key.type === 'Identifier' &&
        property.key.name === 'subject'
      ) return property.value
    }
  }
  return undefined
}

export const workflowPropertySubject = defineRule({
  meta,
  create(context: Context) {
    if (!basenameOf(context.filename).endsWith(WORKFLOW_PROPERTY_SUFFIX)) return {}
    const imported = new Map<string, string>()

    const report = (node: ESTree.Node, messageId: MessageIds, actual: string): void => {
      context.report({
        node,
        messageId,
        data: messageId === 'localSubject'
          ? { name: LOCAL_SUBJECT_NAME, expected: LOCAL_SUBJECT_EXPECTED, actual, fix: LOCAL_SUBJECT_FIX }
          : { name: FOREIGN_SUBJECT_NAME, expected: FOREIGN_SUBJECT_EXPECTED, actual, fix: FOREIGN_SUBJECT_FIX },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.importKind === 'type') return
        for (const specifier of node.specifiers) {
          if ('importKind' in specifier && specifier.importKind === 'type') continue
          imported.set(specifier.local.name, node.source.value)
        }
      },
      'CallExpression:exit'(node: ESTree.CallExpression) {
        if (!isPropCallee(node.callee)) return
        const subject = subjectOf(node)
        if (subject === undefined) return
        const root = rootNameOf(subject)
        if (root === undefined) {
          report(subject, 'localSubject', 'a subject built in the test file as an expression')
          return
        }
        const source = imported.get(root)
        if (source === undefined) {
          report(subject, 'localSubject', `the subject ${root}, declared in the test file`)
          return
        }
        if (!isWorkflowSpecifier(source)) {
          report(subject, 'foreignSubject', `the subject ${root}, imported from ${source}`)
        }
      },
    }
  },
})

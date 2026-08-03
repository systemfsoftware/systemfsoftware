import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option } from 'effect'
import { SNAPSHOT_SUFFIX } from './path.config.js'
import { basenameOf } from './path.js'
import {
  meta,
  MISSING_SNAPSHOT_ACTUAL,
  MISSING_SNAPSHOT_EXPECTED,
  MISSING_SNAPSHOT_FIX,
  MISSING_SNAPSHOT_NAME,
} from './snapshot-test-requires-snapshot.config.js'

export type MessageIds = 'missingSnapshot'

const SNAPSHOT_METHODS: ReadonlySet<string> = new Set([
  'toMatchSnapshot',
  'toMatchInlineSnapshot',
  'toMatchFileSnapshot',
  'toThrowErrorMatchingSnapshot',
])

const isSnapshotMethodName = (property: ESTree.Node | null): boolean =>
  property !== null && property.type === 'Identifier' && SNAPSHOT_METHODS.has(property.name)

const collectCallExpressions = (program: ESTree.Program): ESTree.CallExpression[] => {
  const out: ESTree.CallExpression[] = []
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    const items = Array.isArray(value) ? value : [value]
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue
      const node = item as ESTree.Node
      if (node.type === 'CallExpression') out.push(node)
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue
        walk((node as unknown as Record<string, unknown>)[key])
      }
    }
  }
  walk(program)
  return out
}

const hasSnapshotAssertion = (program: ESTree.Program): boolean => {
  for (const call of collectCallExpressions(program)) {
    const callee = call.callee
    if (callee.type === 'MemberExpression' && isSnapshotMethodName(callee.property)) {
      return true
    }
  }
  return false
}

export const snapshotTestRequiresSnapshot = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!basename.endsWith(SNAPSHOT_SUFFIX)) return {}
    let reported = false
    return {
      'Program:exit'(node: ESTree.Program) {
        if (reported) return
        if (hasSnapshotAssertion(node)) return
        reported = true
        const firstImport = A.findFirst(
          node.body,
          (statement): statement is ESTree.ImportDeclaration => statement.type === 'ImportDeclaration',
        ).pipe(Option.map((statement) => statement.source))
        context.report({
          node: firstImport.pipe(Option.getOrElse(() => node.body[0] ?? node)),
          messageId: 'missingSnapshot',
          data: {
            name: MISSING_SNAPSHOT_NAME,
            expected: MISSING_SNAPSHOT_EXPECTED,
            actual: MISSING_SNAPSHOT_ACTUAL,
            fix: MISSING_SNAPSHOT_FIX,
          },
        })
      },
    }
  },
})

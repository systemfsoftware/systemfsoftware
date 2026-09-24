import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  type BoundaryFunction,
  functionValueOf,
  isTestOrFixturePath,
  originMemberIs,
  originOf,
  recordFunctionsOf,
  recoveryCalleeName,
  typeRegionsOf,
  walkSubtree,
} from './kernel-boundary.js'
import {
  MEDIUM_OWNER,
  MEDIUM_SOURCE,
  meta,
  RECOVERY_ACTUAL,
  RECOVERY_EXPECTED,
  RECOVERY_FIX,
  recoveryName,
} from './medium-owns-no-recovery.config.js'

export type Options = []

export type MessageIds = 'recoveryInMedium'

interface MediumPort {
  readonly fn: BoundaryFunction
  readonly port: string
}

const propertyNameIs = (node: ESTree.Node, name: string): boolean =>
  node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' &&
  node.property.name === name

/**
 * The `Medium.make` calls of the file and the port functions their options
 * record carries, at any record depth. The callee is resolved by import
 * origin — module `@systemfsoftware/effect-daemon-spec`, member path ending
 * `Medium.make` — so a same-named `Medium.make` from any other module is not
 * this gate's boundary, and an alias of the real one is.
 */
const collectMediumPorts = (context: Context): readonly MediumPort[] => {
  const ports: MediumPort[] = []
  const getScope = context.sourceCode.getScope
  walkSubtree(context.sourceCode.ast, context.sourceCode.visitorKeys, [], (node) => {
    if (node.type !== 'CallExpression') return true
    if (!propertyNameIs(node.callee, 'make')) return true
    const origin = originOf(node.callee, getScope)
    if (origin === null || origin.source !== MEDIUM_SOURCE) return true
    if (!originMemberIs(origin, MEDIUM_OWNER, 'make')) return true
    const options = node.arguments[0] ?? null
    for (const { path, fn } of recordFunctionsOf(options, getScope)) {
      ports.push({ fn, port: path })
    }
    return true
  })
  return ports
}

export const mediumOwnsNoRecovery = defineRule({
  meta,
  create(context: Context) {
    if (isTestOrFixturePath(context.filename)) return {}
    const reportedReferences = new Set<string>()
    const visited = new Set<BoundaryFunction>()
    const visitorKeys = context.sourceCode.visitorKeys
    const getScope = context.sourceCode.getScope

    const scan = (target: MediumPort): void => {
      if (visited.has(target.fn)) return
      visited.add(target.fn)
      const regions = typeRegionsOf(target.fn, visitorKeys)
      walkSubtree(target.fn, visitorKeys, regions, (node) => {
        if (node.type === 'MemberExpression' || node.type === 'Identifier') {
          const origin = originOf(node, getScope)
          if (origin !== null) {
            const callee = recoveryCalleeName(origin)
            if (callee !== null) {
              const key = `recovery:${callee}`
              if (!reportedReferences.has(key)) {
                reportedReferences.add(key)
                context.report({
                  node,
                  messageId: 'recoveryInMedium',
                  data: {
                    name: recoveryName(callee),
                    expected: RECOVERY_EXPECTED,
                    actual: RECOVERY_ACTUAL(target.port),
                    fix: RECOVERY_FIX,
                  },
                })
              }
            }
          }
        }
        if (node.type === 'CallExpression') {
          const helper = functionValueOf(node.callee, getScope, 0)
          if (helper !== null) scan({ fn: helper, port: target.port })
        }
        return true
      })
    }

    return {
      Program() {
        for (const port of collectMediumPorts(context)) {
          scan(port)
        }
      },
    }
  },
})

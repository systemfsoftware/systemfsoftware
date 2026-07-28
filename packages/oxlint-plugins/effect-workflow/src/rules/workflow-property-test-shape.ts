import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import { meta, Options, type OptionsType } from './workflow-property-test-shape.config.js'

export type MessageIds = 'plainIt' | 'rawFcAssert' | 'wrongLocation'

const PropertySuffix = '.property.test.ts'

const isCallTo = (node: ESTree.CallExpression, name: string): boolean => {
  if (node.callee.type === 'Identifier') return node.callee.name === name
  if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
    return node.callee.property.name === name
  }
  return false
}

const PathSegments = S.Tuple([S.String, S.String], S.String)

export const workflowPropertyTestShape = defineRule({
  meta,
  create(context: Context) {
    const options: OptionsType = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const testDir = options.testDir
    const filename = context.filename

    let basename: string
    let parentDir: string
    try {
      const decoded = S.decodeUnknownSync(PathSegments)(filename.split('/').reverse())
      basename = decoded[0]
      parentDir = decoded[1]
    } catch {
      return {}
    }

    if (!basename.endsWith(PropertySuffix)) return {}

    if (parentDir !== testDir) {
      return {
        Program(node: ESTree.Program) {
          context.report({
            node,
            messageId: 'wrongLocation',
            data: {
              name: basename,
              expected: `${testDir}/${basename} adjacent to the workflow`,
              actual: `${basename} is under ${parentDir}/ instead of ${testDir}/`,
              fix: `move ${basename} into ${testDir}/ adjacent to the workflow`,
            },
          })
        },
      }
    }

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (isCallTo(node, 'it') && node.callee.type === 'Identifier') {
          context.report({
            node,
            messageId: 'plainIt',
            data: {
              name: 'it()',
              expected: 'it.prop() from @effect/vitest for workflow property tests',
              actual: 'plain it() is used',
              fix: 'replace it() with it.prop() from @effect/vitest',
            },
          })
        }
        if (isCallTo(node, 'assert') && node.callee.type === 'MemberExpression') {
          const callee = node.callee
          if (callee.object.type === 'Identifier' && callee.object.name === 'fc') {
            context.report({
              node,
              messageId: 'rawFcAssert',
              data: {
                name: 'fc.assert()',
                expected: 'it.prop() from @effect/vitest',
                actual: 'raw fc.assert() is used',
                fix: 'replace raw fc.assert() with it.prop() from @effect/vitest',
              },
            })
          }
        }
      },
    }
  },
})

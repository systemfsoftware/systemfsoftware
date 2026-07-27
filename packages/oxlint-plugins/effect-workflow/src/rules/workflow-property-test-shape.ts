import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Option, Schema as S } from 'effect'
import { meta, Options, type OptionsType } from './workflow-property-test-shape.config.js'

export type MessageIds = 'wrongSuffix' | 'plainIt' | 'rawFcAssert' | 'wrongLocation' | 'effectProp'

const isWorkflowTestFile = (filename: string): boolean =>
  A.last(filename.split('/')).pipe(Option.exists((base) => base.includes('.test.') || base.includes('.spec.')))

const PathSegments = S.Tuple([S.String, S.String], S.String)

const isPropertyTestFile = (filename: string, testDir: string): boolean => {
  const [basename, parentDir] = S.decodeUnknownSync(PathSegments)(filename.split('/').reverse())
  return basename.endsWith('.property.test.ts') && parentDir === testDir
}

const isCallTo = (node: ESTree.CallExpression, name: string): boolean => {
  if (node.callee.type === 'Identifier') return node.callee.name === name
  if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
    return node.callee.property.name === name
  }
  return false
}

export const workflowPropertyTestShape = defineRule({
  meta,
  create(context: Context) {
    const options: OptionsType = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const testDir = options.testDir
    const filename = context.filename

    if (!isWorkflowTestFile(filename)) return {}

    if (!isPropertyTestFile(filename, testDir)) {
      return {
        Program(node: ESTree.Program) {
          const base = filename.split('/').pop()!
          context.report({
            node,
            messageId: 'wrongSuffix',
            data: {
              name: base,
              expected: '*.property.test.ts suffix for workflow tests',
              actual: `test file ${base} does not use the *.property.test.ts suffix`,
              fix: 'rename the file to *.property.test.ts',
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
        {
          const callee = node.callee
          if (
            callee.type === 'MemberExpression' &&
            callee.object.type === 'MemberExpression' &&
            callee.object.object.type === 'Identifier' &&
            callee.object.object.name === 'it' &&
            callee.object.property.type === 'Identifier' &&
            callee.object.property.name === 'effect'
          ) {
            context.report({
              node,
              messageId: 'effectProp',
              data: {
                name: 'it.effect.prop()',
                expected: 'it.prop() from @effect/vitest',
                actual: 'it.effect.prop() is used',
                fix: 'replace it.effect.prop() with it.prop() from @effect/vitest',
              },
            })
          }
        }
      },
    }
  },
})

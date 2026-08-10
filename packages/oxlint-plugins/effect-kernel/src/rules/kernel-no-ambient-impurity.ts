import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Option } from 'effect'
import {
  BANNED_BARE_CALLS,
  BANNED_CALLS,
  BANNED_DESTRUCTURES,
  CONSOLE_EXPECTED,
  CONSOLE_FIX,
  DATE_CONSTRUCTION_EXPECTED,
  DATE_CONSTRUCTION_FIX,
  DATE_CONSTRUCTOR_NAME,
  DESTRUCTURE_EXPECTED,
  DESTRUCTURE_FIX,
  FORBIDDEN_EXPECTED,
  FORBIDDEN_FIX,
  meta,
  PROCESS_ENV_EXPECTED,
  PROCESS_ENV_FIX,
} from './kernel-no-ambient-impurity.config.js'

export type MessageIds =
  | 'forbidden'
  | 'forbiddenConstruction'
  | 'forbiddenDestructure'
  | 'forbiddenMember'

const isKernelFile = (filename: string): boolean => filename.endsWith('.kernel.ts')

type MemberTarget = {
  readonly object: string
  readonly property: string
}

const memberCallTarget = (
  node: ESTree.CallExpression,
): Option.Option<MemberTarget> => {
  if (node.callee.type !== 'MemberExpression') return Option.none()
  const callee = node.callee
  if (callee.computed) return Option.none()
  const property = callee.property.name
  const objectNode = callee.object
  if (objectNode.type === 'Identifier') {
    return Option.some({ object: objectNode.name, property })
  }
  if (
    objectNode.type === 'MemberExpression' &&
    !objectNode.computed &&
    objectNode.property.type === 'Identifier'
  ) {
    return Option.some({ object: objectNode.property.name, property })
  }
  return Option.none()
}

const bareCallName = (node: ESTree.CallExpression): Option.Option<string> => {
  if (node.callee.type === 'Identifier') return Option.some(node.callee.name)
  return Option.none()
}

const isProcessEnvRead = (node: ESTree.MemberExpression): boolean =>
  !node.computed &&
  node.object.type === 'MemberExpression' &&
  !node.object.computed &&
  node.object.object.type === 'Identifier' &&
  node.object.object.name === 'process' &&
  node.object.property.name === 'env'

export const kernelNoAmbientImpurity = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isKernelFile(filename)) return {}

    const reportCall = (node: ESTree.CallExpression, name: string) => {
      context.report({
        node,
        messageId: 'forbidden',
        data: {
          name,
          expected: FORBIDDEN_EXPECTED,
          actual: `${name}()`,
          fix: FORBIDDEN_FIX,
        },
      })
    }

    return {
      CallExpression(node: ESTree.CallExpression) {
        Option.match(memberCallTarget(node), {
          onNone: () => {},
          onSome: ({ object, property }) => {
            const callName = `${object}.${property}`
            if (Object.hasOwn(BANNED_CALLS, callName)) {
              reportCall(node, callName)
              return
            }
            if (object === 'console') {
              context.report({
                node,
                messageId: 'forbidden',
                data: {
                  name: `console.${property}`,
                  expected: CONSOLE_EXPECTED,
                  actual: `console.${property}()`,
                  fix: CONSOLE_FIX,
                },
              })
            }
          },
        })

        Option.match(bareCallName(node), {
          onNone: () => {},
          onSome: (name) => {
            if (Object.hasOwn(BANNED_BARE_CALLS, name)) {
              reportCall(node, name)
            }
          },
        })
      },
      NewExpression(node: ESTree.NewExpression) {
        if (node.callee.type === 'Identifier' && node.callee.name === DATE_CONSTRUCTOR_NAME) {
          context.report({
            node,
            messageId: 'forbiddenConstruction',
            data: {
              name: 'new Date()',
              expected: DATE_CONSTRUCTION_EXPECTED,
              actual: 'new Date() construction',
              fix: DATE_CONSTRUCTION_FIX,
            },
          })
        }
      },
      MemberExpression(node: ESTree.MemberExpression) {
        if (!isProcessEnvRead(node)) return
        if (node.property.type !== 'Identifier') return
        context.report({
          node,
          messageId: 'forbiddenMember',
          data: {
            name: 'process.env',
            expected: PROCESS_ENV_EXPECTED,
            actual: `process.env.${node.property.name} read`,
            fix: PROCESS_ENV_FIX,
          },
        })
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.init === null || node.init.type !== 'Identifier') return
        if (node.id.type !== 'ObjectPattern') return
        const bannedMembers = BANNED_DESTRUCTURES[node.init.name]
        if (bannedMembers === undefined) return
        for (const property of node.id.properties) {
          if (property.type !== 'Property') continue
          const value = property.value
          if (value.type !== 'Identifier') continue
          if (!bannedMembers.includes(value.name)) continue
          context.report({
            node,
            messageId: 'forbiddenDestructure',
            data: {
              name: `${node.init.name}.${value.name}`,
              expected: DESTRUCTURE_EXPECTED,
              actual: `destructuring ${value.name} from ${node.init.name}`,
              fix: DESTRUCTURE_FIX,
            },
          })
          return
        }
      },
    }
  },
})

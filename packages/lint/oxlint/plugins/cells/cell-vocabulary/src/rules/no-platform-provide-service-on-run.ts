import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isCellMemberCall, isPipeCall, pipeRootOf } from './cell.js'
import {
  BANNED_TAG_BY_SOURCE,
  DESCRIPTION_NAMESPACE,
  EFFECT_NAMESPACE,
  EFFECT_SOURCES,
  meta,
  MODULE_SOURCE,
  PIPE_NAME,
  PIPE_SOURCES,
  PLATFORM_PROVIDE_SERVICE_ACTUAL,
  PLATFORM_PROVIDE_SERVICE_EXPECTED,
  PLATFORM_PROVIDE_SERVICE_FIX,
  PROVIDE_SERVICE_NAME,
  RUN_NAME,
} from './no-platform-provide-service-on-run.config.js'

export type MessageIds = 'platformProvideServiceOnRun'

export const noPlatformProvideServiceOnRun = defineRule({
  meta,
  create(context: Context) {
    const descriptionNamespaces = new Set<string>()
    const effectNamespaces = new Set<string>()
    const provideServiceNames = new Set<string>()
    const pipeNames = new Set<string>()
    const tagNamespaces = new Map<string, string>()
    const namedTags = new Set<string>()

    const isRunCall = (node: ESTree.Node): boolean =>
      node.type === 'CallExpression' && isCellMemberCall(node, descriptionNamespaces, RUN_NAME)

    const rootedAtRun = (node: ESTree.Node): boolean => {
      if (isRunCall(node)) return true
      if (node.type !== 'CallExpression' || !isPipeCall(node, pipeNames, PIPE_NAME)) return false
      const root = pipeRootOf(node, pipeNames, PIPE_NAME)
      return root !== null && isRunCall(root)
    }

    const tagTextOf = (node: ESTree.Node): string | null => {
      if (node.type === 'Identifier') return namedTags.has(node.name) ? node.name : null
      if (
        node.type === 'MemberExpression' && !node.computed &&
        node.property.type === 'Identifier' && node.object.type === 'Identifier'
      ) {
        const expected = tagNamespaces.get(node.object.name)
        return expected === node.property.name ? `${node.object.name}.${node.property.name}` : null
      }
      return null
    }

    const isProvideServiceCall = (node: ESTree.CallExpression): boolean => {
      const callee = node.callee
      if (callee.type === 'Identifier') return provideServiceNames.has(callee.name)
      if (callee.type === 'MemberExpression' && !callee.computed) {
        return callee.object.type === 'Identifier' &&
          effectNamespaces.has(callee.object.name) &&
          callee.property.type === 'Identifier' &&
          callee.property.name === PROVIDE_SERVICE_NAME
      }
      return false
    }

    const report = (call: ESTree.CallExpression, tagText: string): void => {
      context.report({
        node: call,
        messageId: 'platformProvideServiceOnRun',
        data: {
          name: `Effect.provideService(${tagText}, …)`,
          expected: PLATFORM_PROVIDE_SERVICE_EXPECTED,
          actual: PLATFORM_PROVIDE_SERVICE_ACTUAL,
          fix: PLATFORM_PROVIDE_SERVICE_FIX,
        },
      })
    }

    const classifyImport = (node: ESTree.ImportDeclaration): void => {
      const source = String(node.source.value)
      if (source === MODULE_SOURCE) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            descriptionNamespaces.add(specifier.local.name)
          } else if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === DESCRIPTION_NAMESPACE
          ) {
            descriptionNamespaces.add(specifier.local.name)
          }
        }
        return
      }
      if (EFFECT_SOURCES.some((effectSource) => effectSource === source)) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            effectNamespaces.add(specifier.local.name)
          } else if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
            if (specifier.imported.name === EFFECT_NAMESPACE) effectNamespaces.add(specifier.local.name)
            if (specifier.imported.name === PROVIDE_SERVICE_NAME) provideServiceNames.add(specifier.local.name)
            if (specifier.imported.name === PIPE_NAME) pipeNames.add(specifier.local.name)
          }
        }
        return
      }
      if (PIPE_SOURCES.some((pipeSource) => pipeSource === source)) {
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === PIPE_NAME
          ) {
            pipeNames.add(specifier.local.name)
          }
        }
        return
      }
      const expectedProperty = BANNED_TAG_BY_SOURCE[source]
      if (expectedProperty !== undefined) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            tagNamespaces.set(specifier.local.name, expectedProperty)
          } else if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === expectedProperty
          ) {
            namedTags.add(specifier.local.name)
          }
        }
      }
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') classifyImport(statement)
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isProvideServiceCall(node) && node.arguments.length >= 3) {
          const self = node.arguments[0]
          const tag = node.arguments[1]
          if (self !== undefined && tag !== undefined && rootedAtRun(self)) {
            const tagText = tagTextOf(tag)
            if (tagText !== null) report(node, tagText)
          }
          return
        }
        if (isPipeCall(node, pipeNames, PIPE_NAME)) {
          const root = pipeRootOf(node, pipeNames, PIPE_NAME)
          if (root === null || !isRunCall(root)) return
          for (const step of node.arguments) {
            if (step.type !== 'CallExpression') continue
            if (!isProvideServiceCall(step) || step.arguments.length !== 2) continue
            const tag = step.arguments[0]
            if (tag === undefined) continue
            const tagText = tagTextOf(tag)
            if (tagText !== null) report(step, tagText)
          }
        }
      },
    }
  },
})

import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Result, Schema as S } from 'effect'
import { meta, Options } from './no-product-fakes.config.js'

export type MessageIds = 'fakeApi' | 'bannedImport' | 'bannedEnvironment'

const CONFIG_FILE = /(?:^|\/)vitest\.config\.[cm]?[jt]s$/

const optionsOf = (input: unknown): Options => Result.getOrThrow(S.decodeUnknownResult(Options)(input))

const memberName = (member: ESTree.MemberExpression): string | undefined => {
  if (member.computed) {
    return member.property.type === 'Literal' && typeof member.property.value === 'string'
      ? member.property.value
      : undefined
  }
  return member.property.type === 'Identifier' ? member.property.name : undefined
}

const bansModule = (source: string, bannedModules: readonly string[]): boolean =>
  bannedModules.some((entry) => source === entry || source.startsWith(`${entry}/`))

export const noProductFakes = defineRule({
  meta,
  create(context: Context) {
    const { fakeApis, bannedModules, bannedEnvironments } = optionsOf(context.options[0] ?? {})
    const doubles: Record<string, Record<string, true>> = Object.fromEntries(
      fakeApis.map((api) => [api.object, Object.fromEntries(api.members.map((member) => [member, true as const]))]),
    )
    const inConfig = CONFIG_FILE.test(context.filename)
    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression' || callee.object.type !== 'Identifier') return
        const name = memberName(callee)
        if (name === undefined) return
        if (doubles[callee.object.name]?.[name] === true) {
          context.report({ node, messageId: 'fakeApi', data: { name: `${callee.object.name}.${name}` } })
        }
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (bansModule(node.source.value, bannedModules)) {
          context.report({ node, messageId: 'bannedImport', data: { module: node.source.value } })
        }
      },
      Property(node: ESTree.Node) {
        if (!inConfig || node.type !== 'Property' || node.computed) return
        if (node.key.type !== 'Identifier' || node.key.name !== 'environment') return
        if (node.value.type !== 'Literal' || typeof node.value.value !== 'string') return
        if (bannedEnvironments.includes(node.value.value)) {
          context.report({ node: node.value, messageId: 'bannedEnvironment', data: { environment: node.value.value } })
        }
      },
    }
  },
})

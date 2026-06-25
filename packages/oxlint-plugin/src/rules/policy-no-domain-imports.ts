// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type MessageIds = 'domainImport'

const POLICY_SUFFIX = '.policy.ts' as const

const BANNED_SUFFIXES = new Set([
  'workflow',
  'executor',
  'store',
  'acl',
  'handler',
  'middleware',
  'adapter',
  'service',
  'shell',
  'use-case',
  'daemon',
  'repository',
])

const bannedSuffixOf = (source: string): string | undefined => {
  const segments = source.split('/')
  const lastSegment = segments[segments.length - 1]
  if (lastSegment === undefined) return undefined
  return lastSegment.split('.').find((part) => BANNED_SUFFIXES.has(part))
}

export const policyNoDomainImports = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'A `.policy.ts` is a domain-blind execution combinator; it may not import a behavioural or I/O module (workflow, executor, store, acl, handler, middleware, adapter, service, shell, use-case, daemon, repository).',
    },
    hasSuggestions: false,
    schema: [],
    messages: {
      domainImport:
        'A `.policy.ts` governs only HOW an effect runs and must stay domain-blind. Importing `{{source}}` (a `.{{suffix}}` module) couples this policy to feature/I/O code. Either keep the policy a generic `Effect<A,E,R> -> Effect<A,…,R>` wrapper, or accept that this file is an executor/shell — not a policy.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    if (!context.filename.endsWith(POLICY_SUFFIX)) {
      return {}
    }

    const reportSource = (node: ESTree.Node, source: string): void => {
      const suffix = bannedSuffixOf(source)
      if (suffix === undefined) return
      context.report({ node, messageId: 'domainImport', data: { source, suffix } })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        reportSource(node, node.source.value)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        reportSource(node, node.source.value)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (!node.source) return
        reportSource(node, node.source.value)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return
        reportSource(node, node.source.value)
      },
    }
  },
})

import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DAMP_WORDS,
  meta,
  NULLARY_PREDICATE_SYMBOLS,
  PASCAL_CASE,
  PREDICATE_SYMBOLS,
  SCOPE_SYMBOLS,
} from './pbt-naming.config.js'

export type Options = []
export type MessageIds =
  | 'invalidSegments'
  | 'invalidScopeSymbol'
  | 'incompleteScope'
  | 'emptyDomain'
  | 'domainLeaksDAMP'
  | 'invalidPredicateSymbol'
  | 'incompletePredicate'

const isPropCall = (node: ESTree.CallExpression): boolean => {
  let foundProp = false
  let current: ESTree.Node = node.callee

  // The for-loop's increment expression advances `current` every
  // iteration, so the loop cannot spin even if the body is empty.
  for (; current.type === 'MemberExpression'; current = current.object) {
    if (current.property.type === 'Identifier' && current.property.name === 'prop') {
      foundProp = true
    }
  }

  return (
    foundProp &&
    current.type === 'Identifier' &&
    (current.name === 'it' || current.name === 'test')
  )
}

const extractTestName = (
  node: ESTree.CallExpression,
): string | undefined => {
  const firstArg = node.arguments[0]
  if (!firstArg) {
    return undefined
  }

  if (firstArg.type === 'Literal') {
    return String(firstArg.value)
  }

  if (firstArg.type !== 'TemplateLiteral') {
    return undefined
  }
  if (firstArg.quasis.length !== 1) {
    return undefined
  }
  return firstArg.quasis[0]?.value.cooked ?? undefined
}

const parseSegments = (
  name: string,
): { scopeSegment: string; domainSegment: string; predicateSegment: string } | null => {
  const parts = name.split('_')
  if (parts.length !== 3) {
    return null
  }
  const scopeSegment = parts[0]
  const domainSegment = parts[1]
  const predicateSegment = parts[2]
  if (
    scopeSegment === undefined ||
    domainSegment === undefined ||
    predicateSegment === undefined
  ) {
    return null
  }
  return { scopeSegment, domainSegment, predicateSegment }
}

export const pbtNaming = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isPropCall(node)) {
          return
        }

        const firstArg = node.arguments[0]
        if (!firstArg) {
          return
        }

        const testName = extractTestName(node)
        if (!testName) {
          return
        }

        const segments = parseSegments(testName)
        if (!segments) {
          context.report({
            node: firstArg,
            messageId: 'invalidSegments',
            data: {
              actual: testName,
              count: testName.split('_').length - 1,
            },
          })
          return
        }

        const { scopeSegment, domainSegment, predicateSegment } = segments

        const scopeSymbol = scopeSegment.charAt(0)
        if (!SCOPE_SYMBOLS.has(scopeSymbol)) {
          context.report({
            node: firstArg,
            messageId: 'invalidScopeSymbol',
            data: { actual: testName, firstChar: scopeSymbol },
          })
          return
        }

        if (scopeSegment.slice(1).length === 0) {
          context.report({
            node: firstArg,
            messageId: 'incompleteScope',
            data: { symbol: scopeSymbol, scope: scopeSegment },
          })
          return
        }

        if (!PASCAL_CASE.test(domainSegment)) {
          context.report({
            node: firstArg,
            messageId: 'emptyDomain',
            data: { actual: testName },
          })
          return
        }

        const dampMatch = DAMP_WORDS.exec(domainSegment)
        if (dampMatch) {
          context.report({
            node: firstArg,
            messageId: 'domainLeaksDAMP',
            data: { domain: domainSegment, word: dampMatch[0] },
          })
          return
        }

        const predicateSymbol = predicateSegment.charAt(0)
        if (!PREDICATE_SYMBOLS.has(predicateSymbol)) {
          context.report({
            node: firstArg,
            messageId: 'invalidPredicateSymbol',
            data: { actual: testName, firstChar: predicateSymbol },
          })
          return
        }

        if (!NULLARY_PREDICATE_SYMBOLS.has(predicateSymbol) && predicateSegment.slice(1).length === 0) {
          context.report({
            node: firstArg,
            messageId: 'incompletePredicate',
            data: { symbol: predicateSymbol, predicate: predicateSegment },
          })
          return
        }
      },
    }
  },
})

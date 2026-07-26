// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type Options = []
export type MessageIds =
  | 'invalidSegments'
  | 'invalidScopeSymbol'
  | 'incompleteScope'
  | 'emptyDomain'
  | 'domainLeaksDAMP'
  | 'invalidPredicateSymbol'
  | 'incompletePredicate'

const SCOPE_SYMBOLS = new Set(['∀', '∃', '→', '¬', '≤', '≥'])
const PREDICATE_SYMBOLS = new Set([
  '≡',
  '≠',
  '=',
  '≤',
  '≥',
  '∈',
  '⊆',
  '⊇',
  '→',
  '¬',
  '∘',
  '∩',
  '∪',
  '⊥',
])

const NULLARY_PREDICATE_SYMBOLS = new Set(['⊥'])

const PASCAL_CASE = /^[A-Z][a-z][a-zA-Z0-9]*$/
const DAMP_WORDS = /When|Should|Given|Then|Otherwise|After|Before/

export const pbtNaming = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce a complete formal-specification name for property-based tests (it.prop / it.effect.prop). ' +
        'Format: [ScopeSymbol][binder]_[Domain]_[PredicateSymbol][operand] ' +
        '(e.g., ∀x_DecodeEncode_=x, ∀l_Filter_⊆Input, →Shipped_Cancel_⊥Allowed). ' +
        'Both the quantifier and the predicate must carry an operand — a bare symbol specifies nothing.',
    },
    schema: [],
    messages: {
      invalidSegments: 'Expected: exactly 2 underscores in PBT name ([Scope]_[Domain]_[Predicate]). ' +
        'Actual: name "{{actual}}" has {{count}} separator(s). ' +
        "If this isn't a universal invariant, delete the test. " +
        'Otherwise use format [ScopeSymbol][binder]_[Domain]_[PredicateSymbol][operand] (e.g., ∀x_DecodeEncode_=x).',
      invalidScopeSymbol: 'Expected: a quantifier symbol (∀ ∃ → ¬ ≤ ≥) at the start of "{{actual}}". ' +
        'Actual: it starts with "{{firstChar}}". ' +
        "If this isn't a universal invariant, delete the test. " +
        'Otherwise quantify the input: ∀ (for all), ∃ (there exists), → (implies), ¬, ≤, ≥.',
      incompleteScope: 'Expected: a bound variable after the quantifier "{{symbol}}" in scope segment "{{scope}}" ' +
        '(e.g., ∀x, ∀order, ∃e, →Shipped). ' +
        'A property quantifies over a named input drawn from a generator; name it. ' +
        'A lone quantifier binds nothing and specifies no domain.',
      emptyDomain: 'Expected: a non-empty PascalCase domain between the two underscores in "{{actual}}". ' +
        "If this isn't a universal invariant, delete the test. " +
        'Otherwise name the thing under test, e.g., ∀x_DecodeEncode_=x.',
      domainLeaksDAMP: 'Expected: an invariant domain, not scenario language. ' +
        'Actual: domain "{{domain}}" contains "{{word}}" — that describes one case, not a universal law. ' +
        'Delete this test. It is not a property. Find the actual invariant and write that instead.',
      invalidPredicateSymbol:
        'Expected: a relation symbol (≡ ≠ = ≤ ≥ ∈ ⊆ ⊇ → ¬ ∘ ∩ ∪ ⊥) starting the last segment of "{{actual}}". ' +
        'Actual: it ends with "{{firstChar}}". ' +
        "If this isn't a universal invariant, delete the test. " +
        'Otherwise relate the output: = / ≡ (roundtrip or oracle), ⊆ / ∈ (invariant), ≠ (distinctness), ⊥ (impossibility).',
      incompletePredicate:
        'Expected: an operand after the relation symbol "{{symbol}}" in predicate "{{predicate}}", ' +
        'naming what the output is related to: =x / ≡Oracle (roundtrip or reference), ⊆Input / ∈Ignored (invariant), ' +
        '≠Zero (distinctness), ⊥Cancellable (impossibility — name the outcome that cannot occur). ' +
        'A bare symbol relates the output to nothing and so asserts no property.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    const isPropCall = (node: ESTree.CallExpression): boolean => {
      let foundProp = false
      let current: ESTree.Node = node.callee

      while (current.type === 'MemberExpression') {
        if (current.property.type === 'Identifier' && current.property.name === 'prop') {
          foundProp = true
        }
        current = current.object
      }

      return (
        foundProp &&
        current.type === 'Identifier' &&
        isTestIdentifier(current.name)
      )
    }

    const isTestIdentifier = (name: string): boolean => name === 'it' || name === 'test'

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
      return {
        scopeSegment: parts[0]!,
        domainSegment: parts[1]!,
        predicateSegment: parts[2]!,
      }
    }

    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isPropCall(node)) {
          return
        }

        const testName = extractTestName(node)
        if (!testName) {
          return
        }

        const segments = parseSegments(testName)
        if (!segments) {
          context.report({
            node: node.arguments[0]!,
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
            node: node.arguments[0]!,
            messageId: 'invalidScopeSymbol',
            data: { actual: testName, firstChar: scopeSymbol },
          })
          return
        }

        if (scopeSegment.slice(1).length === 0) {
          context.report({
            node: node.arguments[0]!,
            messageId: 'incompleteScope',
            data: { symbol: scopeSymbol, scope: scopeSegment },
          })
          return
        }

        if (!PASCAL_CASE.test(domainSegment)) {
          context.report({
            node: node.arguments[0]!,
            messageId: 'emptyDomain',
            data: { actual: testName },
          })
          return
        }

        const dampMatch = DAMP_WORDS.exec(domainSegment)
        if (dampMatch) {
          context.report({
            node: node.arguments[0]!,
            messageId: 'domainLeaksDAMP',
            data: { domain: domainSegment, word: dampMatch[0] },
          })
          return
        }

        const predicateSymbol = predicateSegment.charAt(0)
        if (!PREDICATE_SYMBOLS.has(predicateSymbol)) {
          context.report({
            node: node.arguments[0]!,
            messageId: 'invalidPredicateSymbol',
            data: { actual: testName, firstChar: predicateSymbol },
          })
          return
        }

        if (!NULLARY_PREDICATE_SYMBOLS.has(predicateSymbol) && predicateSegment.slice(1).length === 0) {
          context.report({
            node: node.arguments[0]!,
            messageId: 'incompletePredicate',
            data: { symbol: predicateSymbol, predicate: predicateSegment },
          })
          return
        }
      },
    }
  },
})

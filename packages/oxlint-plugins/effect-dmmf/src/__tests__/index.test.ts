import { describe, expect, test } from 'vitest'

import type { Rule } from '@oxlint/plugins'
import corePlugin from '@systemfsoftware/oxlint-plugin'
import cellTaxonomy from '@systemfsoftware/oxlint-plugin-cell-taxonomy'
import effectAcl from '@systemfsoftware/oxlint-plugin-effect-acl'
import effectAdapter from '@systemfsoftware/oxlint-plugin-effect-adapter'
import effectExecutor from '@systemfsoftware/oxlint-plugin-effect-executor'
import effectHandler from '@systemfsoftware/oxlint-plugin-effect-handler'
import effectKernel from '@systemfsoftware/oxlint-plugin-effect-kernel'
import effectMiddleware from '@systemfsoftware/oxlint-plugin-effect-middleware'
import effectObserver from '@systemfsoftware/oxlint-plugin-effect-observer'
import effectPolicy from '@systemfsoftware/oxlint-plugin-effect-policy'
import effectSchema from '@systemfsoftware/oxlint-plugin-effect-schema'
import effectShape from '@systemfsoftware/oxlint-plugin-effect-shape'
import effectState from '@systemfsoftware/oxlint-plugin-effect-state'
import effectStore from '@systemfsoftware/oxlint-plugin-effect-store'
import effectWorkflow from '@systemfsoftware/oxlint-plugin-effect-workflow'
import propertyTesting from '@systemfsoftware/oxlint-plugin-property-testing'
import testHygiene from '@systemfsoftware/oxlint-plugin-test-hygiene'
import testPlacement from '@systemfsoftware/oxlint-plugin-test-placement'

import bundle from '../index.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-dmmf'

interface SourcePlugin {
  readonly meta: { readonly name: string }
  readonly rules: Record<string, Rule>
  readonly configs?: { readonly recommended?: { readonly rules?: Record<string, string> } }
}

const sources: readonly SourcePlugin[] = [
  propertyTesting,
  effectExecutor,
  effectWorkflow,
  cellTaxonomy,
  testHygiene,
  testPlacement,
  effectSchema,
  effectShape,
  effectAcl,
  effectStore,
  effectState,
  effectHandler,
  effectMiddleware,
  effectAdapter,
  effectPolicy,
  effectKernel,
  effectObserver,
]

const ownersByRule = (): Map<string, readonly string[]> => {
  const owners = new Map<string, string[]>()
  for (const source of sources) {
    for (const ruleName of Object.keys(source.rules)) {
      const list = owners.get(ruleName)
      if (list === undefined) {
        owners.set(ruleName, [source.meta.name])
      } else {
        list.push(source.meta.name)
      }
    }
  }
  return owners
}

// vitest's expect() does not take a custom message; the original node:assert
// sites did. These wrappers preserve the load-bearing failure hint while
// keeping the same 5-test, 3-category structure and assertion semantics.
const deepEqual = (actual: unknown, expected: unknown, message: string): void => {
  try {
    expect(actual).toEqual(expected)
  } catch {
    throw new Error(message)
  }
}

const equals = (actual: unknown, expected: unknown, message: string): void => {
  try {
    expect(actual).toBe(expected)
  } catch {
    throw new Error(message)
  }
}

const isTrue = (cond: boolean, message: string): void => {
  try {
    expect(cond).toBe(true)
  } catch {
    throw new Error(message)
  }
}

describe('effect-dmmf bundle aggregation', () => {
  test('Should_ReportNoRuleNameCollisions_When_AllSourcesAreAggregated', () => {
    const collisions = [...ownersByRule().entries()].filter(([, ownerList]) => ownerList.length > 1)
    deepEqual(
      collisions,
      [],
      `A plain object spread silently drops a duplicate rule name; sources must never share one. Collisions: ${
        collisions
          .map(([ruleName, ownerList]) => `${ruleName} (exported by ${ownerList.join(' and ')})`)
          .join('; ')
      }`,
    )
  })

  test('Should_ReexportEverySourceRule_When_AllSourcesAreAggregated', () => {
    for (const source of sources) {
      for (const ruleName of Object.keys(source.rules)) {
        isTrue(
          ruleName in bundle.rules,
          `rule ${ruleName} from ${source.meta.name} is missing from the bundle's exported rules`,
        )
      }
    }
  })

  test('Should_ExcludeCoreRuleNames_When_AggregatingSources', () => {
    // core (@systemfsoftware/oxlint-plugin) is a junk drawer of general rules and is
    // excluded from the one-shot bundle by contract — its name is banned by CONSTITUTION.md IV.2.
    const coreRuleNames = new Set(Object.keys(corePlugin.rules))
    const leaked = Object.keys(bundle.rules).filter((ruleName) => coreRuleNames.has(ruleName))
    deepEqual(leaked, [], `core rule name(s) must not appear in the bundle: ${leaked.join(', ')}`)
  })

  test('Should_RecommendEverySourceRecommendedRule_When_AggregatingSources', () => {
    for (const source of sources) {
      const sourceRecommended = source.configs?.recommended?.rules ?? {}
      for (const qualifiedName of Object.keys(sourceRecommended)) {
        const ruleName = qualifiedName.slice(qualifiedName.lastIndexOf('/') + 1)
        equals(
          bundle.configs.recommended.rules[`${PLUGIN_NAME}/${ruleName}`],
          'error',
          `rule ${ruleName} is recommended by ${source.meta.name} but not enabled by the bundle`,
        )
      }
    }
  })

  test('Should_NotRecommendWorkflowInlineSchemas_When_AggregatingSources', () => {
    isTrue('workflow-inline-schemas' in bundle.rules, 'workflow-inline-schemas must stay registered')
    isTrue(
      !(`${PLUGIN_NAME}/workflow-inline-schemas` in bundle.configs.recommended.rules),
      'workflow-inline-schemas must stay unrecommended',
    )
  })
})

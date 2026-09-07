import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import effectNative from '@systemfsoftware/oxlint-plugin-effect-native'
import effectSchema from '@systemfsoftware/oxlint-plugin-effect-schema'
import effectWorkflow from '@systemfsoftware/oxlint-plugin-effect-workflow'
import propertyTesting from '@systemfsoftware/oxlint-plugin-property-testing'
import structure from '@systemfsoftware/oxlint-plugin-structure'
import tagDiscipline from '@systemfsoftware/oxlint-plugin-tag-discipline'
import testHygiene from '@systemfsoftware/oxlint-plugin-test-hygiene'
import testPlacement from '@systemfsoftware/oxlint-plugin-test-placement'
import type { OxlintConfig } from 'oxlint'
import { describe, expect, it } from 'vitest'

import base from '../oxlint-config.base.js'

/**
 * The plugin namespaces the base preset loads, derived from its own `jsPlugins`
 * instead of a hardcoded parallel list: each resolved plugin URL is walked up to
 * its owning `package.json`, and the package name is the namespace its rules key
 * on. A plugin added to `jsPlugins` is covered automatically; a plugin removed
 * orphans its `@systemfsoftware/…` rule keys and the orphan check fails on them.
 */
const namespaceOf = (resolved: string): string | null => {
  let dir = path.dirname(fileURLToPath(new URL(resolved)))
  for (;;) {
    try {
      const raw = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as unknown
      const name = typeof raw === 'object' && raw !== null && 'name' in raw ? raw.name : undefined
      if (typeof name === 'string') return `${name}/`
    } catch {
      // not a package root; keep walking up
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const LOADED_NAMESPACES = (base.jsPlugins ?? [])
  .map(namespaceOf)
  .filter((namespace): namespace is string => namespace !== null)

const baseRules: NonNullable<OxlintConfig['rules']> = base.rules ?? {}

const HOUSE_NAMESPACE = '@systemfsoftware/oxlint-plugin/'

/**
 * The recommended house rules the three private leaves publish, re-keyed under
 * the aggregate namespace exactly the way the aggregate re-keys them. The union
 * of these sets is what the base preset's core-namespace `error` entries must
 * name: a rule dropped from a leaf's recommendations, or added to it without
 * the aggregate carrying it, breaks the equality here instead of drifting
 * silently.
 */
const leafRecommendedUnion = [effectNative, tagDiscipline, structure].flatMap((leaf) => {
  const leafNamespace = `${leaf.meta?.name ?? ''}/`
  return Object.keys(leaf.configs?.recommended?.rules ?? {}).map((key) =>
    key.startsWith(leafNamespace) ? `${HOUSE_NAMESPACE}${key.slice(leafNamespace.length)}` : key
  )
})

const baseRecommendedHouseKeys = Object.keys(baseRules).filter(
  (name) => name.startsWith(HOUSE_NAMESPACE) && baseRules[name] === 'error',
)

const orphanedRuleKeys = Object.keys(baseRules).filter(
  (name) => name.startsWith('@systemfsoftware/') && !LOADED_NAMESPACES.some((ns) => name.startsWith(ns)),
)

describe('base preset registration integrity', () => {
  it('Should_SpreadTheAggregateRecommendations_When_DmmfRecommendationNamesARule', () => {
    for (const ruleKey of Object.keys(effectDmmf.configs?.recommended?.rules ?? {})) {
      expect(Object.hasOwn(baseRules, ruleKey)).toBe(true)
    }
  })

  it('Should_Not_RegisterRulesFromAnUnloadedPlugin', () => {
    expect(orphanedRuleKeys).toStrictEqual([])
  })

  it('Should_UnionLeafRecommendations_When_TheAggregateReKeysThem', () => {
    expect([...baseRecommendedHouseKeys].sort()).toStrictEqual([...leafRecommendedUnion].sort())
  })

  it('Should_RecommendEveryShippedRule_When_ALeafPublishesIt', () => {
    const missing: string[] = []
    const prematurelyEnrolled: string[] = []
    for (const leaf of INSPECTED_LEAVES) {
      const plugin = leaf.meta?.name ?? ''
      const recommended = leaf.configs?.recommended?.rules ?? {}
      for (const ruleName of Object.keys(leaf.rules ?? {})) {
        const key = `${plugin}/${ruleName}`
        if (allowlisted(plugin, ruleName)) {
          if (Object.hasOwn(recommended, key)) prematurelyEnrolled.push(key)
        } else if (recommended[key] !== 'error') {
          missing.push(key)
        }
      }
    }
    expect(missing).toStrictEqual([])
    expect(prematurelyEnrolled).toStrictEqual([])
  })

  it('Should_NameOnlyRealRules_When_AnAllowlistEntryCoversAnInspectedLeaf', () => {
    const inspected = new Map(INSPECTED_LEAVES.map((leaf) => [leaf.meta?.name ?? '', leaf]))
    for (const entry of NOT_YET_ENROLLED) {
      const leaf = inspected.get(entry.plugin)
      if (leaf === undefined) continue
      expect(Object.hasOwn(leaf.rules ?? {}, entry.rule)).toBe(true)
      expect(Object.hasOwn(leaf.configs?.recommended?.rules ?? {}, `${entry.plugin}/${entry.rule}`)).toBe(false)
    }
  })
})

interface AllowlistEntry {
  readonly plugin: string
  readonly rule: string
  readonly date: string
  readonly reason: string
}

/**
 * Rules absent from their leaf's recommended set, each dated and reasoned.
 * Dated-baseline shape: an entry whose rule is now recommended fails, and an
 * entry naming no real rule of its leaf fails — the list can only shrink.
 * The U1 pair awaits its enrollment commit (migration wave in flight). The
 * structure and tag-discipline entries are deliberate absences per the
 * aggregate's own comment (recommending them would fire on correct consumer
 * code), recorded here so a fifth absence still fails. The cell-vocabulary
 * pair enrolled 2026-09-07 after the tree verified clean.
 */
const NOT_YET_ENROLLED: readonly AllowlistEntry[] = [
  {
    plugin: '@systemfsoftware/oxlint-plugin-effect-schema',
    rule: 'schema-bare-primitive-field',
    date: '2026-09-07',
    reason: 'U1 evaluator landed; enrollment ships in its own commit',
  },
  {
    plugin: '@systemfsoftware/oxlint-plugin-effect-schema',
    rule: 'schema-brand-requires-filter',
    date: '2026-09-07',
    reason: 'U1 evaluator landed; enrollment ships in its own commit',
  },
  {
    plugin: '@systemfsoftware/oxlint-plugin-structure',
    rule: 'ban-classes',
    date: '2026-09-07',
    reason:
      'Deliberate absence per the aggregate: needs a per-package whitelist; recommending would fire on consumers first file',
  },
  {
    plugin: '@systemfsoftware/oxlint-plugin-structure',
    rule: 'no-barrels',
    date: '2026-09-07',
    reason: 'Deliberate absence per the aggregate: fires on correct code',
  },
  {
    plugin: '@systemfsoftware/oxlint-plugin-structure',
    rule: 'no-inline-destructured-type',
    date: '2026-09-07',
    reason: 'Deliberate absence per the aggregate: fires on correct code',
  },
  {
    plugin: '@systemfsoftware/oxlint-plugin-tag-discipline',
    rule: 'no-bodyless-status-assertion',
    date: '2026-09-07',
    reason: 'Deliberate absence per the aggregate: needs a status-assertion vocabulary only some packages have',
  },
]

interface LeafPlugin {
  readonly meta?: { readonly name?: string }
  readonly rules?: Record<string, unknown>
  readonly configs?: { readonly recommended?: { readonly rules?: Record<string, string> } }
}

const INSPECTED_LEAVES: readonly LeafPlugin[] = [
  effectNative,
  structure,
  tagDiscipline,
  effectSchema,
  effectWorkflow,
  propertyTesting,
  testHygiene,
  testPlacement,
]

const allowlisted = (plugin: string, rule: string): boolean =>
  NOT_YET_ENROLLED.some((entry) => entry.plugin === plugin && entry.rule === rule)

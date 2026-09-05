import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import effectNative from '@systemfsoftware/oxlint-plugin-effect-native'
import structure from '@systemfsoftware/oxlint-plugin-structure'
import tagDiscipline from '@systemfsoftware/oxlint-plugin-tag-discipline'
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
})

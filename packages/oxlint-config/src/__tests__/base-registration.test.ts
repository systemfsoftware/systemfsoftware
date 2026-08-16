import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import type { OxlintConfig } from 'oxlint'
import { describe, expect, it } from 'vitest'

import base from '../oxlint-config.base.js'

/**
 * The two namespaces the base preset loads: core (`@systemfsoftware/oxlint-plugin`,
 * hand-registered below) and the dmmf aggregate (`effect-dmmf`, whose
 * `configs.recommended.rules` the base spreads). Every `@systemfsoftware/…` rule key
 * the preset configures must live under one of them — a key under any other
 * namespace is an orphaned registration that resolves to a plugin the preset never
 * loads and therefore never fires.
 */
const LOADED_NAMESPACES = ['@systemfsoftware/oxlint-plugin/', '@systemfsoftware/oxlint-plugin-effect-dmmf/'] as const

const baseRules: NonNullable<OxlintConfig['rules']> = base.rules ?? {}

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
})

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cellVocabularyPlugin from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import cellVocabularyPreset from '@systemfsoftware/oxlint-plugin-cell-vocabulary/preset'
import effectEntrypointPlugin from '@systemfsoftware/oxlint-plugin-effect-entrypoint'
import effectEntrypointPreset from '@systemfsoftware/oxlint-plugin-effect-entrypoint/preset'
import effectNativePlugin from '@systemfsoftware/oxlint-plugin-effect-native'
import effectNativePreset from '@systemfsoftware/oxlint-plugin-effect-native/preset'
import effectSchemaPlugin from '@systemfsoftware/oxlint-plugin-effect-schema'
import effectSchemaPreset from '@systemfsoftware/oxlint-plugin-effect-schema/preset'
import effectWorkflowPlugin from '@systemfsoftware/oxlint-plugin-effect-workflow'
import effectWorkflowPreset from '@systemfsoftware/oxlint-plugin-effect-workflow/preset'
import propertyTestingPlugin from '@systemfsoftware/oxlint-plugin-property-testing'
import propertyTestingPreset from '@systemfsoftware/oxlint-plugin-property-testing/preset'
import recommended from '@systemfsoftware/oxlint-plugin-recommended'
import structurePlugin from '@systemfsoftware/oxlint-plugin-structure'
import structurePreset from '@systemfsoftware/oxlint-plugin-structure/preset'
import tagDisciplinePlugin from '@systemfsoftware/oxlint-plugin-tag-discipline'
import tagDisciplinePreset from '@systemfsoftware/oxlint-plugin-tag-discipline/preset'
import testHygienePlugin from '@systemfsoftware/oxlint-plugin-test-hygiene'
import testHygienePreset from '@systemfsoftware/oxlint-plugin-test-hygiene/preset'
import testPlacementPlugin from '@systemfsoftware/oxlint-plugin-test-placement'
import testPlacementPreset from '@systemfsoftware/oxlint-plugin-test-placement/preset'
import { describe, expect, it } from 'vitest'

import canonical from '../canonical.js'
import { defaultIgnores } from '../default-ignores.js'
import instrument from '../instrument.js'
import { isUnknownArray, parseJson } from './oxlint-probe.js'

const FRAGMENTS = [
  { plugin: effectNativePlugin, preset: effectNativePreset },
  { plugin: tagDisciplinePlugin, preset: tagDisciplinePreset },
  { plugin: structurePlugin, preset: structurePreset },
  { plugin: effectSchemaPlugin, preset: effectSchemaPreset },
  { plugin: effectWorkflowPlugin, preset: effectWorkflowPreset },
  { plugin: propertyTestingPlugin, preset: propertyTestingPreset },
  { plugin: testHygienePlugin, preset: testHygienePreset },
  { plugin: testPlacementPlugin, preset: testPlacementPreset },
  { plugin: cellVocabularyPlugin, preset: cellVocabularyPreset },
  { plugin: effectEntrypointPlugin, preset: effectEntrypointPreset },
] as const

const AGGREGATE_NAMESPACES = [
  '@systemfsoftware/oxlint-plugin/',
  '@systemfsoftware/oxlint-plugin-effect-dmmf/',
] as const

const CUSTOM_RULE_PREFIX = '@systemfsoftware/'

const collectConfigTree = (config: unknown): { jsPlugins: unknown[]; ruleKeys: string[] } => {
  const jsPlugins: unknown[] = []
  const ruleKeys: string[] = []
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    if ('extends' in node && Array.isArray(node.extends)) {
      for (const parent of node.extends) visit(parent)
    }
    if ('jsPlugins' in node && isUnknownArray(node.jsPlugins)) jsPlugins.push(...node.jsPlugins)
    if ('rules' in node && typeof node.rules === 'object' && node.rules !== null) {
      ruleKeys.push(...Object.keys(node.rules))
    }
  }
  visit(config)
  return { jsPlugins, ruleKeys }
}

const namespaceOf = (entry: unknown): string | null => {
  if (typeof entry !== 'string') {
    if (typeof entry === 'object' && entry !== null && 'name' in entry && typeof entry.name === 'string') {
      return `${entry.name}/`
    }
    return null
  }
  let dir = path.dirname(fileURLToPath(new URL(entry)))
  for (;;) {
    const manifest = path.join(dir, 'package.json')
    if (existsSync(manifest)) {
      const raw: unknown = parseJson(readFileSync(manifest, 'utf8'))
      const name = raw !== null && typeof raw === 'object' && 'name' in raw ? raw.name : undefined
      if (typeof name === 'string') return `${name}/`
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

describe('canonical root registration contract', () => {
  it('Should_ExtendTheFragmentsInOrder_When_TheCanonicalRootIsComposed', () => {
    expect(canonical.extends).toHaveLength(11)
    expect(canonical.extends[0]).toBe(recommended)
    expect(canonical.extends[1]).toBe(effectNativePreset)
    expect(canonical.extends[2]).toBe(tagDisciplinePreset)
    expect(canonical.extends[3]).toBe(structurePreset)
    expect(canonical.extends[4]).toBe(effectSchemaPreset)
    expect(canonical.extends[5]).toBe(effectWorkflowPreset)
    expect(canonical.extends[6]).toBe(propertyTestingPreset)
    expect(canonical.extends[7]).toBe(testHygienePreset)
    expect(canonical.extends[8]).toBe(testPlacementPreset)
    expect(canonical.extends[9]).toBe(cellVocabularyPreset)
    expect(canonical.extends[10]).toBe(effectEntrypointPreset)
  })

  it('Should_DeclareOnlyItsOwnKeys_When_PluginsComeFromTheFragments', () => {
    expect(Object.keys(canonical).sort()).toStrictEqual([
      'categories',
      'extends',
      'options',
      'overrides',
      'plugins',
      'rules',
    ])
    // @ts-expect-error runtime guard against a key the config type does not declare
    expect(canonical.jsPlugins).toBeUndefined()
  })

  it('Should_DeclareExactlyThreeRules_When_TheRestAreInheritedFromAFragment', () => {
    expect(Object.keys(canonical.rules).sort()).toStrictEqual([
      'no-restricted-imports',
      'no-ternary',
      'typescript/switch-exhaustiveness-check',
    ])
  })

  it('Should_CoverEveryCustomRuleKey_When_TheFragmentsSelfRegisterTheirPlugins', () => {
    const { jsPlugins, ruleKeys } = collectConfigTree(canonical)
    const namespaces = jsPlugins
      .map((entry) => namespaceOf(entry))
      .filter((namespace): namespace is string => namespace !== null)
    const customRuleKeys = ruleKeys.filter((key) => key.startsWith('@systemfsoftware/'))
    const orphaned = customRuleKeys.filter((key) => !namespaces.some((namespace) => key.startsWith(namespace)))
    expect(customRuleKeys.length).toBeGreaterThan(0)
    expect(orphaned).toStrictEqual([])
  })

  it('Should_ComposeExactlyTheFragmentRuleUnion_When_TheCanonicalRootIsComposed', () => {
    const declared = FRAGMENTS.flatMap(({ plugin, preset }) => {
      const namespaces = collectConfigTree(preset).jsPlugins
        .map((entry) => namespaceOf(entry))
        .filter((value): value is string => value !== null)
      expect(namespaces).toHaveLength(1)
      const keys = Object.keys(plugin.configs.recommended.rules)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys.filter((key) => !namespaces.some((namespace) => key.startsWith(namespace)))).toStrictEqual([])
      return keys
    }).sort()

    const composed = collectConfigTree(canonical).ruleKeys
      .filter((key) => key.startsWith(CUSTOM_RULE_PREFIX))
      .sort()

    expect(composed).toStrictEqual(declared)
    expect(
      composed.filter((key) => AGGREGATE_NAMESPACES.some((namespace) => key.startsWith(namespace))),
    ).toStrictEqual([])
  })
})

describe('instrument root registration contract', () => {
  it('Should_ExtendTheRecommendedTier_When_TheInstrumentRootIsComposed', () => {
    expect(instrument.extends).toHaveLength(1)
    expect(instrument.extends[0]).toBe(recommended)
  })

  it('Should_DeclareNoProductKeys_When_TheSubjectIsTheLinter', () => {
    expect(Object.keys(instrument).sort()).toStrictEqual([
      'categories',
      'extends',
      'options',
      'plugins',
    ])
    // @ts-expect-error runtime guard against a key the config type does not declare
    expect(instrument.rules).toBeUndefined()
  })
})

describe('default ignores', () => {
  it('Should_ListTheNineNonSourceGlobs_When_AConfigNeedsTheExclusionList', () => {
    expect(defaultIgnores).toStrictEqual([
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.stryker-tmp/**',
      '**/*.d.ts',
      '**/*.tsbuildinfo',
    ])
  })
})

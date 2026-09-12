import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cellVocabularyPreset from '@systemfsoftware/oxlint-plugin-cell-vocabulary/preset'
import effectDmmfPreset from '@systemfsoftware/oxlint-plugin-effect-dmmf/preset'
import effectEntrypointPreset from '@systemfsoftware/oxlint-plugin-effect-entrypoint/preset'
import recommended from '@systemfsoftware/oxlint-plugin-recommended'
import housePreset from '@systemfsoftware/oxlint-plugin/preset'
import { describe, expect, it } from 'vitest'

import canonical from '../canonical.js'
import { defaultIgnores } from '../default-ignores.js'
import instrument from '../instrument.js'

const collectConfigTree = (config: unknown): { jsPlugins: unknown[]; ruleKeys: string[] } => {
  const jsPlugins: unknown[] = []
  const ruleKeys: string[] = []
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    if ('extends' in node && Array.isArray(node.extends)) {
      for (const parent of node.extends) visit(parent)
    }
    if ('jsPlugins' in node && Array.isArray(node.jsPlugins)) jsPlugins.push(...node.jsPlugins)
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
      const raw: { name?: unknown } = JSON.parse(readFileSync(manifest, 'utf8'))
      if (typeof raw.name === 'string') return `${raw.name}/`
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

describe('canonical root registration contract', () => {
  it('Should_ExtendTheFragmentsInOrder_When_TheCanonicalRootIsComposed', () => {
    expect(canonical.extends).toHaveLength(5)
    expect(canonical.extends?.[0]).toBe(recommended)
    expect(canonical.extends?.[1]).toBe(housePreset)
    expect(canonical.extends?.[2]).toBe(effectDmmfPreset)
    expect(canonical.extends?.[3]).toBe(cellVocabularyPreset)
    expect(canonical.extends?.[4]).toBe(effectEntrypointPreset)
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
    expect(Object.keys(canonical.rules ?? {}).sort()).toStrictEqual([
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
})

describe('instrument root registration contract', () => {
  it('Should_ExtendTheRecommendedTier_When_TheInstrumentRootIsComposed', () => {
    expect(instrument.extends).toHaveLength(1)
    expect(instrument.extends?.[0]).toBe(recommended)
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

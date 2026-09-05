import { describe, expect, it } from 'vitest'

import plugin from '../index.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin'

const EXPECTED_RULES = [
  'ban-classes',
  'ban-error-string',
  'internal-export-jsdoc',
  'no-barrels',
  'no-bodyless-status-assertion',
  'no-context-generic-tag',
  'no-date-now-in-effect',
  'no-direct-tag-access',
  'no-domain-branching-density',
  'no-either-tag-assertions',
  'no-inline-destructured-type',
  'no-internal-jsdoc-outside',
  'no-io-boundary-tests',
  'no-logging-in-catch',
  'no-native-map-in-effect',
  'no-native-set-in-effect',
  'no-native-setinterval-in-effect',
  'no-native-settimeout-in-effect',
  'no-new-promise-in-effect',
  'no-new-worker-with-wasm-import',
]

const UNRECOMMENDED: Record<string, true> = {
  'ban-classes': true,
  'no-barrels': true,
  'no-inline-destructured-type': true,
  'no-bodyless-status-assertion': true,
}

const EXPECTED_RECOMMENDED = EXPECTED_RULES.filter((name) => !UNRECOMMENDED[name]).map(
  (name) => `${PLUGIN_NAME}/${name}`,
)

describe('aggregate registration contract', () => {
  it('Should_ExposeTheTwentyPreSplitRules_When_TheAggregateSpreadsTheLeaves', () => {
    const keys = Object.keys(plugin.rules)
    expect(keys.length).toBe(EXPECTED_RULES.length)
    expect(new Set(keys)).toStrictEqual(new Set(EXPECTED_RULES))
  })

  it('Should_RecommendTheSixteenPreSplitIds_When_TheAggregateDerivesRecommended', () => {
    const keys = Object.keys(plugin.configs.recommended.rules)
    expect(keys.length).toBe(EXPECTED_RECOMMENDED.length)
    expect(new Set(keys)).toStrictEqual(new Set(EXPECTED_RECOMMENDED))
  })

  it('Should_KeepTheHousePluginName_When_RulesAreReKeyedFromTheLeaves', () => {
    expect(plugin.meta.name).toBe(PLUGIN_NAME)
  })
})

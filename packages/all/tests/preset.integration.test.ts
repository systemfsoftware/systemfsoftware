import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import base from '@systemfsoftware/oxlint-config/base'
import house from '@systemfsoftware/oxlint-plugin'
import cellVocabulary from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import effectDmmf from '@systemfsoftware/oxlint-plugin-effect-dmmf'
import { Effect } from 'effect'
import { expect } from 'vitest'

import all from '../src/mod.js'

const HOUSE_PREFIX = '@systemfsoftware/oxlint-plugin/'

/** The four rule families a consumer must receive, named by their plugin prefix. */
const REQUIRED_FAMILIES: Record<string, string> = {
  vocabulary: '@systemfsoftware/oxlint-plugin-cell-vocabulary/',
  cell: '@systemfsoftware/oxlint-plugin-effect-dmmf/',
  entrypoint: '@systemfsoftware/oxlint-plugin-effect-entrypoint/',
  house: HOUSE_PREFIX,
}

const rulesOf = (config: { readonly rules?: Record<string, unknown> }): Record<string, unknown> => config.rules ?? {}

const houseKeysAtError = (rules: Record<string, unknown>): readonly string[] =>
  Object.entries(rules)
    .filter(([key, value]) => key.startsWith(HOUSE_PREFIX) && value === 'error')
    .map(([key]) => key)
    .sort()

const Feature = makeFeature({ it, layer })

Feature('@systemfsoftware/all — the preset a consumer installs')
  .body(({ scenario }) => {
    scenario(
      'Preset_HouseRules_MatchThePluginsOwnRecommendation',
      Gherkin.Do.pipe(
        Given('the house plugin publishes what it recommends')(
          'recommended',
          () => Effect.sync(() => Object.keys(rulesOf(house.configs.recommended)).sort()),
        ),
        When('the preset is read')('preset', () => Effect.sync(() => houseKeysAtError(rulesOf(all)))),
        Then('the preset enables exactly those rules, never a transcribed subset')((s) =>
          Effect.sync(() => {
            expect(s.preset).toStrictEqual(s.recommended)
          })
        ),
      ),
    )

    scenario(
      'Preset_InternalBaseConfig_EnablesTheSameHouseRules',
      Gherkin.Do.pipe(
        Given('the internal config this repo lints itself with')(
          'internal',
          () => Effect.sync(() => houseKeysAtError(rulesOf(base))),
        ),
        When('the plugin/s own recommendation is read')(
          'recommended',
          () => Effect.sync(() => Object.keys(rulesOf(house.configs.recommended)).sort()),
        ),
        Then('a consumer receives what this repo enforces on itself')((s) =>
          Effect.sync(() => {
            expect(s.recommended).toStrictEqual(s.internal)
          })
        ),
      ),
    )

    scenario(
      'Preset_EveryCustomRule_IsError',
      Gherkin.Do.pipe(
        Given('the preset/s rule map')('rules', () => Effect.sync(() => rulesOf(all))),
        When('the custom-plugin entries are separated from the stock ones')(
          'custom',
          (s) => Effect.sync(() => Object.entries(s.rules).filter(([key]) => key.startsWith('@systemfsoftware/'))),
        ),
        Then('no custom rule ships at warn or off')((s) =>
          Effect.sync(() => {
            expect(s.custom.length).toBeGreaterThan(0)
            expect(s.custom.filter(([, value]) => value !== 'error')).toStrictEqual([])
          })
        ),
      ),
    )

    scenario(
      'Preset_EveryRequiredFamily_IsRepresented',
      Gherkin.Do.pipe(
        Given('the preset/s rule keys')('keys', () => Effect.sync(() => Object.keys(rulesOf(all)))),
        When('each required family is counted')(
          'counts',
          (s) =>
            Effect.sync(() =>
              Object.entries(REQUIRED_FAMILIES).map(([family, prefix]) =>
                [family, s.keys.filter((key) => key.startsWith(prefix)).length] as const
              )
            ),
        ),
        Then('every family contributes at least one rule')((s) =>
          Effect.sync(() => {
            expect(s.counts.filter(([, count]) => count === 0)).toStrictEqual([])
          })
        ),
      ),
    )

    scenario(
      'Preset_AggregatedCellRules_AreNotSilentlyEmpty',
      Gherkin.Do.pipe(
        Given('the aggregator that carries workflow, schema, placement, property and hygiene')(
          'aggregated',
          () => Effect.sync(() => Object.keys(rulesOf(effectDmmf.configs.recommended))),
        ),
        When('the vocabulary tier is read alongside it')(
          'vocabulary',
          () => Effect.sync(() => Object.keys(rulesOf(cellVocabulary.configs.recommended))),
        ),
        Then('both reach the preset intact')((s) =>
          Effect.sync(() => {
            const keys = Object.keys(rulesOf(all))
            expect(s.aggregated.length).toBeGreaterThan(0)
            expect(s.vocabulary.length).toBeGreaterThan(0)
            expect(s.aggregated.filter((key) => !keys.includes(key))).toStrictEqual([])
            expect(s.vocabulary.filter((key) => !keys.includes(key))).toStrictEqual([])
          })
        ),
      ),
    )

    scenario(
      'Preset_OxcNamespace_SurvivesThePluginList',
      Gherkin.Do.pipe(
        Given('oxlint replaces its default plugin set when `plugins` is given')(
          'plugins',
          () => Effect.sync(() => all.plugins ?? []),
        ),
        When('the list is inspected for the namespace that has no reporting flag')(
          'hasOxc',
          (s) => Effect.sync(() => s.plugins.includes('oxc')),
        ),
        Then('oxc is listed explicitly, so its correctness rules are not silently dropped')((s) =>
          Effect.sync(() => {
            expect(s.hasOxc).toBe(true)
          })
        ),
      ),
    )
  })

import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { type AnyPluginContribution, declarePlugin } from '@systemfsoftware/stryker-js'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'

import { buildPluginLoadPlan, create, type PluginLoadPlan } from '../run/Plugins.js'

const GATE_KIND = 'Evaluator'

const CASED_NAME_ARB = fc.stringMatching(/^[A-Za-z][A-Za-z0-9-]{0,10}$/)

const planOf = (earlier: string, later: string): PluginLoadPlan =>
  buildPluginLoadPlan([
    {
      moduleName: 'contribution-gate-module',
      plugins: [declarePlugin(GATE_KIND, earlier, () => () => null)],
      schemaContribution: undefined,
    },
    {
      moduleName: 'case-variant-gate-module',
      plugins: [declarePlugin(GATE_KIND, later, () => () => null)],
      schemaContribution: undefined,
    },
  ])

describe('buildPluginLoadPlan', () => {
  it.prop(
    '∀n_CaseOnlyNameVariants_≡TheEarlierContributionIsShadowedOnce',
    [CASED_NAME_ARB],
    ([name]) => {
      const plan = planOf(name.toLowerCase(), name.toUpperCase())
      const [shadowing] = plan.shadowings
      return plan.shadowings.length === 1 && shadowing !== undefined &&
        shadowing.kind === GATE_KIND &&
        shadowing.name === name.toUpperCase() &&
        shadowing.shadowedIndex === 0 &&
        shadowing.winnerIndex === 1
    },
  )

  it.prop(
    '∀n_CaseOnlyNameVariants_≡TheKindBucketKeepsOnlyTheWinner',
    [CASED_NAME_ARB],
    ([name]) => {
      const earlier = name.toLowerCase()
      const later = name.toUpperCase()
      const bucket = Option.getOrElse(HashMap.get(planOf(earlier, later).pluginsByKind, GATE_KIND), () => [])
      return bucket.length === 1 && bucket[0]?.name === later
    },
  )

  it.effect.prop(
    '∀n_CaseOnlyNameVariants_≡ResolutionIgnoresTheCasingOfTheQuery',
    [CASED_NAME_ARB],
    ([name]) => {
      const earlier = name.toLowerCase()
      const later = name.toUpperCase()
      const plan = planOf(earlier, later)
      return Effect.gen(function*() {
        const foundEarlier = yield* Effect.result(create(plan.pluginsByKind, GATE_KIND, earlier))
        const foundLater = yield* Effect.result(create(plan.pluginsByKind, GATE_KIND, later))
        const declared: readonly AnyPluginContribution[] = Option.getOrElse(
          HashMap.get(plan.pluginsByKind, GATE_KIND),
          () => [],
        )
        return Result.isSuccess(foundEarlier) && Result.isSuccess(foundLater) &&
          foundEarlier.success === foundLater.success &&
          declared.includes(foundEarlier.success)
      })
    },
  )
})

import type { Rule } from '@oxlint/plugins'
import cellImports from '@systemfsoftware/oxlint-plugin-cell-imports'
import cellTaxonomy from '@systemfsoftware/oxlint-plugin-cell-taxonomy'
import effectAcl from '@systemfsoftware/oxlint-plugin-effect-acl'
import effectAdapter from '@systemfsoftware/oxlint-plugin-effect-adapter'
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

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-dmmf'

interface SourcePlugin {
  readonly meta: { readonly name: string }
  readonly rules: Record<string, Rule>
  // optional: a source may register rules without recommending any (test-hygiene did until 2026-08-01)
  readonly configs?: { readonly recommended?: { readonly rules?: Record<string, string> } }
}

// effect-workflow registers workflow-inline-schemas without recommending it;
// recommend only what each source itself recommends, never everything in `rules`.
const recommendedFrom = (source: SourcePlugin): Record<string, 'error'> => {
  const recommended: Record<string, 'error'> = {}
  const sourceRecommended = source.configs?.recommended?.rules ?? {}
  for (const ruleName of Object.keys(source.rules)) {
    if (`${source.meta.name}/${ruleName}` in sourceRecommended) {
      recommended[`${PLUGIN_NAME}/${ruleName}`] = 'error'
    }
  }
  return recommended
}

export default {
  meta: { name: PLUGIN_NAME },
  rules: {
    ...propertyTesting.rules,
    ...cellImports.rules,
    ...effectWorkflow.rules,
    ...cellTaxonomy.rules,
    ...testHygiene.rules,
    ...testPlacement.rules,
    ...effectSchema.rules,
    ...effectShape.rules,
    ...effectAcl.rules,
    ...effectStore.rules,
    ...effectState.rules,
    ...effectHandler.rules,
    ...effectMiddleware.rules,
    ...effectAdapter.rules,
    ...effectPolicy.rules,
    ...effectKernel.rules,
    ...effectObserver.rules,
  },
  configs: {
    recommended: {
      rules: {
        ...recommendedFrom(propertyTesting),
        ...recommendedFrom(cellImports),
        ...recommendedFrom(effectWorkflow),
        ...recommendedFrom(cellTaxonomy),
        ...recommendedFrom(testHygiene),
        ...recommendedFrom(testPlacement),
        ...recommendedFrom(effectSchema),
        ...recommendedFrom(effectShape),
        ...recommendedFrom(effectAcl),
        ...recommendedFrom(effectStore),
        ...recommendedFrom(effectState),
        ...recommendedFrom(effectHandler),
        ...recommendedFrom(effectMiddleware),
        ...recommendedFrom(effectAdapter),
        ...recommendedFrom(effectPolicy),
        ...recommendedFrom(effectKernel),
        ...recommendedFrom(effectObserver),
      },
    },
  },
}

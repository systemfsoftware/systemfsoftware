import type { Rule } from '@oxlint/plugins'
import cellTaxonomy from '@systemfsoftware/oxlint-plugin-cell-taxonomy'
import effectExecutor from '@systemfsoftware/oxlint-plugin-effect-executor'
import effectWorkflow from '@systemfsoftware/oxlint-plugin-effect-workflow'
import propertyTesting from '@systemfsoftware/oxlint-plugin-property-testing'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-dmmf'

interface SourcePlugin {
  readonly meta: { readonly name: string }
  readonly rules: Record<string, Rule>
  readonly configs: { readonly recommended: { readonly rules: Record<string, 'error'> } }
}

// effect-workflow registers workflow-inline-schemas without recommending it;
// recommend only what each source itself recommends, never everything in `rules`.
const recommendedFrom = (source: SourcePlugin): Record<string, 'error'> => {
  const recommended: Record<string, 'error'> = {}
  for (const ruleName of Object.keys(source.rules)) {
    if (`${source.meta.name}/${ruleName}` in source.configs.recommended.rules) {
      recommended[`${PLUGIN_NAME}/${ruleName}`] = 'error'
    }
  }
  return recommended
}

export default {
  meta: { name: PLUGIN_NAME },
  rules: {
    ...propertyTesting.rules,
    ...effectExecutor.rules,
    ...effectWorkflow.rules,
    ...cellTaxonomy.rules,
  },
  configs: {
    recommended: {
      rules: {
        ...recommendedFrom(propertyTesting),
        ...recommendedFrom(effectExecutor),
        ...recommendedFrom(effectWorkflow),
        ...recommendedFrom(cellTaxonomy),
      },
    },
  },
}

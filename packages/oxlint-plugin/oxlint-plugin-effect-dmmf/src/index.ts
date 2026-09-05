import type { Rule } from '@oxlint/plugins'
import effectSchema from '@systemfsoftware/oxlint-plugin-effect-schema'
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

// Recommend only what each source itself recommends, never everything in `rules`.
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
    ...effectWorkflow.rules,
    ...testHygiene.rules,
    ...testPlacement.rules,
    ...effectSchema.rules,
  },
  configs: {
    recommended: {
      rules: {
        ...recommendedFrom(propertyTesting),
        ...recommendedFrom(effectWorkflow),
        ...recommendedFrom(testHygiene),
        ...recommendedFrom(testPlacement),
        ...recommendedFrom(effectSchema),
      },
    },
  },
}

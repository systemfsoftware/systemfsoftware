import { MESSAGE } from './path.config.js'

export const NO_LAYER_IN_FEATURE_NAME = 'a *.integration.test.ts feature with no environment double' as const
export const NO_LAYER_IN_FEATURE_EXPECTED =
  'a feature builder chained with .withLayer(...) or .withScenarioLayer(...)' as const
export const NO_LAYER_IN_FEATURE_ACTUAL =
  'a Feature(...) call with no .withLayer or .withScenarioLayer builder method' as const
export const NO_LAYER_IN_FEATURE_FIX =
  'an integration test under WGI-CLS1 exercises real collaborator seams using Layer doubles (withLayer or withScenarioLayer). A test with no Layers is a pure in-memory calculation: move its laws into deterministic-universal scenarios, or provide the external boundary Layer it exercises.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.integration.test.ts Feature builder must configure at least one environment Layer (.withLayer or .withScenarioLayer) to enforce real integration boundaries under WGI-CLS1.',
  },
  schema: [],
  messages: {
    noLayerInFeature: MESSAGE,
  },
} as const

import { MESSAGE } from './path.config.js'

export const NO_LAYER_IN_FEATURE_NAME = 'a behaviour test feature with no environment double' as const
export const NO_LAYER_IN_FEATURE_EXPECTED =
  'a Feature builder chained with .withLayer(layer) or .withScenarioLayer(layer)' as const
export const NO_LAYER_IN_FEATURE_ACTUAL = 'a Feature(...) call without .withLayer or .withScenarioLayer' as const
export const NO_LAYER_IN_FEATURE_FIX =
  'a behaviour test under WGI-CLS1 must declare its collaborator environment via .withLayer(...) or .withScenarioLayer(...). Chain .withLayer(Layer.empty) (or .withScenarioLayer(Layer.empty)) if the feature exercises in-memory collaborators without custom services, or provide the external boundary Layer it exercises (e.g. .withLayer(MyService.Live)).' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'In a behaviour test - any test file that imports @systemfsoftware/effect-gherkin-spec, whatever its name - every Feature builder must configure at least one environment Layer (.withLayer or .withScenarioLayer) to enforce real integration boundaries under WGI-CLS1.',
  },
  schema: [],
  messages: {
    noLayerInFeature: MESSAGE,
  },
} as const

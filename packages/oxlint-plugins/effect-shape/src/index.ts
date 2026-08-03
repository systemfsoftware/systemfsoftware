import { shapeNoAntiPatternPath } from './rules/shape-no-anti-pattern-path.js'
import { shapeNoBehaviour } from './rules/shape-no-behaviour.js'
import { shapeOneForeignSystem } from './rules/shape-one-foreign-system.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-shape'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('shape-no-anti-pattern-path')]: 'error',
  [rule('shape-no-behaviour')]: 'error',
  [rule('shape-one-foreign-system')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'shape-no-anti-pattern-path': shapeNoAntiPatternPath,
    'shape-no-behaviour': shapeNoBehaviour,
    'shape-one-foreign-system': shapeOneForeignSystem,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}

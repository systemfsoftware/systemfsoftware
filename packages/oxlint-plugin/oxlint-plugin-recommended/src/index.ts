import { cellArchitecture } from './cell-architecture.js'
import { dmmf } from './dmmf.js'
import { recommended } from './recommended.js'
import { ruleAuthoring } from './rule-authoring.js'

/**
 * Shared oxlint presets, shipped as plugin configs.
 *
 * A consumer wires one with `extends: [plugin.configs.<name>]` in its own
 * `oxlint.config.ts`. Ignore patterns are repository configuration: oxlint does
 * not carry `ignorePatterns` through `extends`, so each lint root declares its own.
 */
export default {
  meta: {
    name: '@systemfsoftware/oxlint-plugin-recommended',
  },
  rules: {},
  configs: {
    recommended,
    'cell-architecture': cellArchitecture,
    dmmf,
    'rule-authoring': ruleAuthoring,
  },
}

import { strykerPlugins as effectSchemaIgnorer } from './effect-schema-ignorer/index.js'
import { strykerPlugins as inSourceTestIgnorer } from './in-source-test-ignorer/index.js'
import { strykerPlugins as workflowMakeBoundaryIgnorer } from './workflow-make-ignorer/index.js'

export const strykerPlugins = [
  ...effectSchemaIgnorer,
  ...inSourceTestIgnorer,
  ...workflowMakeBoundaryIgnorer,
]

import { cellImportBoundary } from './rules/cell-import-boundary.js'
import { noBarrelImportInCell } from './rules/no-barrel-import-in-cell.js'
import { noTestRuntimeInPureCell } from './rules/no-test-runtime-in-pure-cell.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-imports'

export default {
  meta: { name: PLUGIN_NAME },
  rules: {
    'cell-import-boundary': cellImportBoundary,
    'no-barrel-import-in-cell': noBarrelImportInCell,
    'no-test-runtime-in-pure-cell': noTestRuntimeInPureCell,
  },
  configs: {
    recommended: {
      rules: {
        [`${PLUGIN_NAME}/cell-import-boundary`]: 'error',
        [`${PLUGIN_NAME}/no-barrel-import-in-cell`]: 'error',
        [`${PLUGIN_NAME}/no-test-runtime-in-pure-cell`]: 'error',
      },
    },
  },
}

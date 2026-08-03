import { cellImportBoundary } from './rules/cell-import-boundary.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-imports'

export default {
  meta: { name: PLUGIN_NAME },
  rules: {
    'cell-import-boundary': cellImportBoundary,
  },
  configs: {
    recommended: {
      rules: {
        [`${PLUGIN_NAME}/cell-import-boundary`]: 'error',
      },
    },
  },
}

import cellArchitecturePlugin from '@systemfsoftware/oxlint-plugin-cell-architecture'
import type { OxlintConfig } from 'oxlint'

export const cellArchitectureJsPlugins: readonly string[] = [
  import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-architecture'),
]

export const cellArchitecture: OxlintConfig = {
  plugins: ['typescript', 'import', 'jsdoc', 'oxc', 'promise'],
  jsPlugins: [...cellArchitectureJsPlugins],
  options: { typeAware: true },
  categories: { correctness: 'error' },
  rules: {
    ...cellArchitecturePlugin.configs.recommended.rules,
  },
}

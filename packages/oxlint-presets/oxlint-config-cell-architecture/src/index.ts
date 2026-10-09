import { ignorePatterns } from '@systemfsoftware/oxlint-config-rule-authoring'
import cellArchitecture from '@systemfsoftware/oxlint-plugin-cell-architecture'
import type { OxlintConfig } from 'oxlint'

export const jsPlugins: readonly string[] = [
  import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-architecture'),
]

export const plugins: NonNullable<OxlintConfig['plugins']> = [
  'typescript',
  'import',
  'jsdoc',
  'oxc',
  'promise',
]

export const options: NonNullable<OxlintConfig['options']> = {
  typeAware: true,
}

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...cellArchitecture.configs.recommended.rules,
}

const cellArchitectureConfig: OxlintConfig = {
  plugins: [...plugins],
  jsPlugins: [...jsPlugins],
  options: { ...options },
  categories: { correctness: 'error' },
  ignorePatterns: [...ignorePatterns],
  rules: {
    ...rules,
  },
}

export default cellArchitectureConfig

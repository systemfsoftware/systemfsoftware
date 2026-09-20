import dmmfConfig, { jsPlugins as dmmfJsPlugins } from '@systemfsoftware/oxlint-config-dmmf'
import cellArchitecture from '@systemfsoftware/oxlint-plugin-cell-architecture'
import effectPlatform from '@systemfsoftware/oxlint-plugin-effect-platform'
import type { OxlintConfig } from 'oxlint'

export const jsPlugins: readonly string[] = [
  ...dmmfJsPlugins,
  import.meta.resolve('@systemfsoftware/oxlint-plugin-effect-platform'),
  import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-architecture'),
]

export const rules: NonNullable<OxlintConfig['rules']> = {
  ...effectPlatform.configs.recommended.rules,
  ...cellArchitecture.configs.recommended.rules,
}

const cellArchitectureConfig: OxlintConfig = {
  extends: [dmmfConfig],
  jsPlugins: [...jsPlugins],
  overrides: [
    {
      files: ['**/src/**', '**/*.test.ts'],
      rules: {
        ...rules,
      },
    },
  ],
}

export default cellArchitectureConfig

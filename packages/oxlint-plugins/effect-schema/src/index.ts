import { banEffectSchemaImports } from './rules/ban-@-effect-schema-imports.js'
import { banDataTaggedError } from './rules/ban-data-taggederror.js'
import { noManualTagProperty } from './rules/no-manual-tag-property.js'
import { noSchemaLawDuplicate } from './rules/no-schema-law-duplicate.js'
import { schemaExportsOnlySchemas } from './rules/schema-exports-only-schemas.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-schema'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('ban-effect-schema-imports')]: 'error',
  [rule('ban-data-taggederror')]: 'error',
  [rule('no-manual-tag-property')]: 'error',
  [rule('no-schema-law-duplicate')]: 'error',
  [rule('schema-exports-only-schemas')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'ban-effect-schema-imports': banEffectSchemaImports,
    'ban-data-taggederror': banDataTaggedError,
    'no-manual-tag-property': noManualTagProperty,
    'no-schema-law-duplicate': noSchemaLawDuplicate,
    'schema-exports-only-schemas': schemaExportsOnlySchemas,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}

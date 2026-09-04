import { banEffectSchemaImports } from './rules/ban-@-effect-schema-imports.js'
import { banDataTaggedError } from './rules/ban-data-taggederror.js'
import { noManualTagMember } from './rules/no-manual-tag-member.js'
import { noManualTagProperty } from './rules/no-manual-tag-property.js'
import { schemaCheckedElementNamed } from './rules/schema-checked-element-named.js'
import { schemaDeclarationLocation } from './rules/schema-declaration-location.js'
import { schemaFileExportsSchemasOnly } from './rules/schema-file-exports-schemas-only.js'
import { schemaFilterConstructiveGeneration } from './rules/schema-filter-constructive-generation.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-effect-schema'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('ban-effect-schema-imports')]: 'error',
  [rule('ban-data-taggederror')]: 'error',
  [rule('no-manual-tag-member')]: 'error',
  [rule('no-manual-tag-property')]: 'error',
  [rule('schema-checked-element-named')]: 'error',
  [rule('schema-declaration-location')]: 'error',
  [rule('schema-filter-constructive-generation')]: 'error',
  [rule('schema-file-exports-schemas-only')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'ban-effect-schema-imports': banEffectSchemaImports,
    'ban-data-taggederror': banDataTaggedError,
    'no-manual-tag-member': noManualTagMember,
    'no-manual-tag-property': noManualTagProperty,
    'schema-checked-element-named': schemaCheckedElementNamed,
    'schema-declaration-location': schemaDeclarationLocation,
    'schema-filter-constructive-generation': schemaFilterConstructiveGeneration,
    'schema-file-exports-schemas-only': schemaFileExportsSchemasOnly,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}

export const PLUGIN_PACKAGES = [
  'oxlint-plugin',
  'oxlint-plugin-effect-native',
  'oxlint-plugin-tag-discipline',
  'oxlint-plugin-structure',
  'oxlint-plugin-cell-vocabulary',
  'oxlint-plugin-effect-dmmf',
  'oxlint-plugin-effect-entrypoint',
  'oxlint-plugin-effect-schema',
  'oxlint-plugin-effect-workflow',
  'oxlint-plugin-property-testing',
  'oxlint-plugin-test-hygiene',
  'oxlint-plugin-test-placement',
  'oxlint-plugin-recommended',
] as const

/**
 * Published under the scope, with no workspace package and no reference from any
 * consumer config. Shipped from the retired `packages/lint/oxlint/plugins/` and
 * `packages/oxlint-plugins/` layouts.
 */
export const RETIRED_OR_ABSENT = [
  'oxlint-plugin-cell-imports',
  'oxlint-plugin-cell-taxonomy',
  'oxlint-plugin-effect-executor',
  'oxlint-plugin-effect-kernel',
] as const

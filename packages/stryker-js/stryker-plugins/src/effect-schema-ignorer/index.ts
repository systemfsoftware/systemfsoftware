import type { IgnorerFactory } from '@systemfsoftware/stryker-js/Ignorer'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'

import { ancestorsOf, type IgnorerPath } from '../AncestorPath.js'
import {
  ANNOTATION_OBJECT_IGNORED,
  ANNOTATION_TEXT_IGNORED,
  BRAND_NAME_IGNORED,
  CLASS_FIELDS_IGNORED,
  CLASS_ID_IGNORED,
  decideSchemaDeclarationIgnore,
  OPTIONAL_DEFAULT_IGNORED,
  SYMBOL_DESCRIPTION_IGNORED,
  TAGGED_FIELDS_IGNORED,
  TAGGED_TAG_IGNORED,
} from './SchemaDeclarationIgnore.js'

const decisionAt = (chain: readonly unknown[], position: number): string | undefined =>
  decideSchemaDeclarationIgnore(chain[position], chain[position + 1], chain[position + 2], chain[position + 3])

const firstIgnoreReason = (path: IgnorerPath): string | undefined => {
  const chain = [path.node, ...ancestorsOf(path)]
  return chain.reduce<string | undefined>((found, _, position) => found ?? decisionAt(chain, position), undefined)
}

const makeIgnorer: IgnorerFactory = () => (path) => firstIgnoreReason(path) ?? null

export const strykerPlugins = [
  declarePlugin('Ignorer', 'effect-schema-declarations', makeIgnorer),
]

// Public-surface decision: tests reach the decision function through the barrel.
export {
  ANNOTATION_OBJECT_IGNORED,
  ANNOTATION_TEXT_IGNORED,
  BRAND_NAME_IGNORED,
  CLASS_FIELDS_IGNORED,
  CLASS_ID_IGNORED,
  decideSchemaDeclarationIgnore,
  OPTIONAL_DEFAULT_IGNORED,
  SYMBOL_DESCRIPTION_IGNORED,
  TAGGED_FIELDS_IGNORED,
  TAGGED_TAG_IGNORED,
}

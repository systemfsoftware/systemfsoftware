import { Ignorer } from '@systemfsoftware/stryker-js'
import { declarePlugin } from '@systemfsoftware/stryker-js'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
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

export const strykerPlugins = [
  declarePlugin(
    'Ignore',
    'effect-schema-declarations',
    Layer.succeed(Ignorer, {
      shouldIgnore: (path: IgnorerPath) => Option.fromUndefinedOr(firstIgnoreReason(path)),
    }),
  ),
]

// Public-surface decision: tests reach the decision function through the
// barrel rather than deep-importing the .kernel.ts cell.
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

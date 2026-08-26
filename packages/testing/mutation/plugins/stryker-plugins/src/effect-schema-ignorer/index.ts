import { Ignorer } from '@systemfsoftware/stryker-js/Ignorer'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
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

interface IgnorerPath {
  readonly node: unknown
  readonly parentPath?: IgnorerPath | null
}

export const strykerPlugins = [
  declarePlugin(
    'Ignore',
    'effect-schema-declarations',
    Layer.succeed(Ignorer, {
      shouldIgnore: (path: IgnorerPath) => {
        for (let current: IgnorerPath | null | undefined = path; current; current = current.parentPath) {
          const parent = current.parentPath
          const grandparent = parent?.parentPath
          const reason = decideSchemaDeclarationIgnore(
            current.node,
            parent?.node,
            grandparent?.node,
            grandparent?.parentPath?.node,
          )
          if (reason !== undefined) {
            return Option.some(reason)
          }
        }
        return Option.none()
      },
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

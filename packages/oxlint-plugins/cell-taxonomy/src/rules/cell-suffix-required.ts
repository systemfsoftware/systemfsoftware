import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import {
  CONTRACT_MODULE_NAME,
  DECLARATION_SEGMENT,
  GENERATED_SEGMENT,
  meta,
  SANCTIONED_TEST_DIRS,
  SRC_DIR,
  TEST_SEGMENTS,
  UNSANCTIONED_ACTUAL,
  UNSANCTIONED_FIX,
} from './cell-suffix-required.config.js'

export type MessageIds = 'unsanctionedCell'

const Options = S.Struct({
  cells: S.Array(S.String),
  exempt: S.Array(S.String),
})

const decodeOptions = S.decodeUnknownSync(Options)

const NonEmptySegments = S.NonEmptyArray(S.String)

const splitOn = (separator: string) => (value: string): A.NonEmptyReadonlyArray<string> =>
  S.decodeUnknownSync(NonEmptySegments)(value.split(separator))

const pathSegmentsOf = splitOn('/')

const dotSegmentsOf = splitOn('.')

/** `.ts`, `.mts`, `.cts` - never `.tsx`: a component is named by PascalCase, a different axis. */
const MODULE_EXTENSION = /\.[cm]?ts$/

export const cellSuffixRequired = defineRule({
  meta,
  create(context: Context) {
    const pathSegments = pathSegmentsOf(context.filename)
    const basename = A.lastNonEmpty(pathSegments)
    const directories = A.initNonEmpty(pathSegments)

    if (!MODULE_EXTENSION.test(basename)) return {}
    if (!directories.includes(SRC_DIR)) return {}
    if (directories.some((segment) => SANCTIONED_TEST_DIRS.has(segment))) return {}

    const stem = dotSegmentsOf(basename.replace(MODULE_EXTENSION, ''))
    const trailing = A.lastNonEmpty(stem)

    if (trailing === DECLARATION_SEGMENT) return {}
    if (stem.length > 1 && trailing === GENERATED_SEGMENT) return {}
    if (TEST_SEGMENTS.has(trailing)) return {}

    const { cells, exempt } = decodeOptions(context.options[0])

    if (exempt.includes(basename)) return {}
    if (stem.length > 1 && cells.includes(trailing)) return {}

    // A single PascalCase segment is a contract module naming the symbol it exports
    // (the vendored Effect convention: Brand.ts exports Brand, Workflow.ts exports
    // Workflow). Sanctioned on the name alone - CT3 keeps this rule filename-in,
    // decision-out; the lowercase and multi-segment names below stay forbidden.
    if (stem.length === 1 && CONTRACT_MODULE_NAME.test(trailing)) return {}

    return {
      Program(node: ESTree.Program) {
        context.report({
          node,
          messageId: 'unsanctionedCell',
          data: {
            name: basename,
            expected: `<name>.<cell>.ts with <cell> one of ${
              cells.join(', ')
            }, a PascalCase contract module naming the symbol it exports, or exactly one of ${exempt.join(', ')}`,
            actual: UNSANCTIONED_ACTUAL,
            fix: UNSANCTIONED_FIX,
          },
        })
      },
    }
  },
})

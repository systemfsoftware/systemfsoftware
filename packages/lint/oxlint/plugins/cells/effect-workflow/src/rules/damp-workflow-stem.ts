import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ANONYMOUS_EXPORT_ACTUAL,
  MAX_STEM_TOKENS,
  MECHANISM_STEM_ACTUAL,
  MECHANISM_STEM_EXPECTED,
  MECHANISM_STEM_FIX,
  MECHANISM_TOKENS,
  meta,
  STEM_EXPORT_MISMATCH_ACTUAL,
  STEM_EXPORT_MISMATCH_EXPECTED,
  STEM_EXPORT_MISMATCH_FIX,
  STEM_NOT_KEBAB_ACTUAL,
  STEM_NOT_KEBAB_EXPECTED,
  STEM_NOT_KEBAB_FIX,
  STEM_PATTERN,
  STEM_TOO_SHORT_ACTUAL,
  STEM_TOO_SHORT_EXPECTED,
  STEM_TOO_SHORT_FIX,
  VACANT_FIRST_TOKEN_ACTUAL,
  VACANT_FIRST_TOKEN_EXPECTED,
  VACANT_FIRST_TOKEN_FIX,
  VACANT_FIRST_TOKENS,
  WORKFLOW_SUFFIX,
} from './damp-workflow-stem.config.js'
import { WORKFLOW_FILE_BASENAME } from './make-file-location.config.js'
import { basenameOf, type ExportWalkValue, walkExportedValues } from './ValueExports.js'

export type MessageIds =
  | 'stemNotKebab'
  | 'stemTooShort'
  | 'vacantFirstToken'
  | 'mechanismStem'
  | 'stemExportMismatch'

type ValueExport = ExportWalkValue
const camelCaseOf = (tokens: readonly string[]): string =>
  (tokens[0] ?? '') + tokens.slice(1).map((token) => token.slice(0, 1).toUpperCase() + token.slice(1)).join('')

export const dampWorkflowStem = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!WORKFLOW_FILE_BASENAME.test(basename)) return {}
    const stem = basename.slice(0, -WORKFLOW_SUFFIX.length)
    return {
      Program(program: ESTree.Program) {
        const tokens = stem.split('-')
        if (!STEM_PATTERN.test(stem) || tokens.length > MAX_STEM_TOKENS) {
          context.report({
            node: program,
            messageId: 'stemNotKebab',
            data: {
              name: basename,
              expected: STEM_NOT_KEBAB_EXPECTED,
              actual: STEM_NOT_KEBAB_ACTUAL,
              fix: STEM_NOT_KEBAB_FIX,
            },
          })
          return
        }
        if (tokens.length === 1) {
          context.report({
            node: program,
            messageId: 'stemTooShort',
            data: {
              name: basename,
              expected: STEM_TOO_SHORT_EXPECTED,
              actual: STEM_TOO_SHORT_ACTUAL,
              fix: STEM_TOO_SHORT_FIX,
            },
          })
          return
        }
        const first = tokens[0] ?? ''
        if (VACANT_FIRST_TOKENS[first] === true) {
          context.report({
            node: program,
            messageId: 'vacantFirstToken',
            data: {
              name: basename,
              expected: VACANT_FIRST_TOKEN_EXPECTED,
              actual: VACANT_FIRST_TOKEN_ACTUAL,
              fix: VACANT_FIRST_TOKEN_FIX,
            },
          })
          return
        }
        if (MECHANISM_TOKENS[first] === true) {
          context.report({
            node: program,
            messageId: 'mechanismStem',
            data: {
              name: basename,
              expected: MECHANISM_STEM_EXPECTED,
              actual: MECHANISM_STEM_ACTUAL,
              fix: MECHANISM_STEM_FIX,
            },
          })
          return
        }
        const values: ValueExport[] = []
        walkExportedValues(program, {
          onValue: (value) => {
            values.push(value)
          },
        })
        if (values.length !== 1) return
        const single = values[0]
        if (single === undefined) return
        if (single.name === null) {
          context.report({
            node: single.node,
            messageId: 'stemExportMismatch',
            data: {
              name: basename,
              expected: STEM_EXPORT_MISMATCH_EXPECTED,
              actual: ANONYMOUS_EXPORT_ACTUAL,
              fix: STEM_EXPORT_MISMATCH_FIX,
            },
          })
          return
        }
        if (camelCaseOf(tokens) !== single.name) {
          context.report({
            node: single.node,
            messageId: 'stemExportMismatch',
            data: {
              name: basename,
              expected: STEM_EXPORT_MISMATCH_EXPECTED,
              actual: STEM_EXPORT_MISMATCH_ACTUAL,
              fix: STEM_EXPORT_MISMATCH_FIX,
            },
          })
        }
      },
    }
  },
})

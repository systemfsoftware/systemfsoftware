import * as S from 'effect/Schema'

export const ToolName = S.NonEmptyString.pipe(S.brand('ToolName'))
export type ToolName = S.Schema.Type<typeof ToolName>

export const FilePath = S.NonEmptyString.pipe(S.brand('FilePath'))
export type FilePath = S.Schema.Type<typeof FilePath>

export const ToolInput = S.Record({ key: S.String, value: S.Unknown })
export type ToolInput = S.Schema.Type<typeof ToolInput>

export const EditToolName = S.Literal(
  'Write',
  'Edit',
  'Update',
  'MultiEdit',
  'Create',
  'morph_mcp_edit-file',
  'morph_edit',
)
export type EditToolName = S.Schema.Type<typeof EditToolName>

export const OxlintConfigBasename = S.Literal(
  'oxlint.config.ts',
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  '.oxlintrc.json',
  'oxlint.json',
)
export type OxlintConfigBasename = S.Schema.Type<typeof OxlintConfigBasename>

export const LintableExtension = S.Literal('ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs')
export type LintableExtension = S.Schema.Type<typeof LintableExtension>

export class EditCommand extends S.TaggedClass<EditCommand>()('EditCommand', {
  toolName: ToolName,
  filePath: FilePath,
  toolInput: ToolInput,
}) {}

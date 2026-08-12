import * as v from 'valibot'

export const EDIT_TOOL_NAMES = [
  'Write',
  'Edit',
  'Update',
  'MultiEdit',
  'Create',
  'morph_mcp_edit-file',
  'morph_edit',
] as const

export const OXLINT_CONFIG_BASENAMES = [
  'oxlint.config.ts',
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  '.oxlintrc.json',
  'oxlint.json',
] as const

export const LINTABLE_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'] as const

export type EditToolName = typeof EDIT_TOOL_NAMES[number]
export type OxlintConfigBasename = typeof OXLINT_CONFIG_BASENAMES[number]
export type LintableExtension = typeof LINTABLE_EXTENSIONS[number]

export const ToolNameSchema = v.pipe(v.string(), v.minLength(1), v.brand('ToolName'))
export const FilePathSchema = v.pipe(v.string(), v.minLength(1), v.brand('FilePath'))

export type ToolName = v.InferOutput<typeof ToolNameSchema>
export type FilePath = v.InferOutput<typeof FilePathSchema>

export interface EditCommand {
  readonly _tag: 'EditCommand'
  readonly toolName: ToolName
  readonly filePath: FilePath
  readonly toolInput: Readonly<Record<string, unknown>>
}

export const isEditToolName = (value: string): value is EditToolName =>
  EDIT_TOOL_NAMES.some((name) => name === value)

export const isLintableExtension = (value: string): value is LintableExtension =>
  LINTABLE_EXTENSIONS.some((extension) => extension === value)

export const isOxlintConfigBasename = (value: string): value is OxlintConfigBasename =>
  OXLINT_CONFIG_BASENAMES.some((basename) => basename === value)

const HookPayloadSchema = v.object({
  tool_name: v.pipe(v.string(), v.minLength(1)),
  tool_input: v.optional(v.record(v.string(), v.unknown())),
})

const editedPath = (toolInput: Readonly<Record<string, unknown>> | undefined): string | undefined => {
  const value = toolInput?.['file_path']
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// Every rejection is the same observable outcome — a contentless no-op the guard
// allows — so the reasons are deliberately not distinguished in the return type.
export const decodeEditCommand = (raw: string): EditCommand | undefined => {
  const payload = v.safeParse(HookPayloadSchema, parseJson(raw))
  if (!payload.success) {
    return undefined
  }
  const filePath = editedPath(payload.output.tool_input)
  if (filePath === undefined || !isEditToolName(payload.output.tool_name)) {
    return undefined
  }
  return {
    _tag: 'EditCommand',
    toolName: v.parse(ToolNameSchema, payload.output.tool_name),
    filePath: v.parse(FilePathSchema, filePath),
    toolInput: payload.output.tool_input ?? {},
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

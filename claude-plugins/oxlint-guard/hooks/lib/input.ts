const EDIT_TOOLS: Record<string, true> = {
  'Write': true,
  'Edit': true,
  'Update': true,
  'MultiEdit': true,
  'Create': true,
  'morph_edit': true,
  'morph_mcp_edit-file': true,
}

const LINTABLE_EXT_RE = /\.[mc]?[jt]sx?$/

const OXLINT_CONFIG_BASENAMES: Record<string, true> = {
  'oxlint.config.ts': true,
  'oxlint.config.js': true,
  'oxlint.config.mjs': true,
  'oxlint.config.cjs': true,
  'oxlint.json': true,
  '.oxlintrc.json': true,
}

export interface HookInput {
  toolName: string
  filePath: string
}

export function parseHookInput(raw: string): HookInput {
  if (raw === '' || raw == null) return { toolName: '', filePath: '' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { toolName: '', filePath: '' }
  }
  if (parsed == null || typeof parsed !== 'object') {
    return { toolName: '', filePath: '' }
  }
  const obj = parsed as Record<string, unknown>

  const toolName = typeof obj.tool_name === 'string' ? obj.tool_name : ''

  let filePath = ''
  const toolInput = obj.tool_input
  if (toolInput != null && typeof toolInput === 'object') {
    const ti = toolInput as Record<string, unknown>
    if (typeof ti.file_path === 'string') {
      filePath = ti.file_path
    } else if (typeof ti.path === 'string') {
      filePath = ti.path
    }
  }
  return { toolName, filePath }
}

export function isEditTool(name: string): boolean {
  return EDIT_TOOLS[name] === true
}

export function isLintable(path: string): boolean {
  if (path === '') return false
  const slash = path.lastIndexOf('/')
  const base = slash >= 0 ? path.slice(slash + 1) : path
  return LINTABLE_EXT_RE.test(base)
}

export function isOxlintConfig(path: string): boolean {
  if (path === '') return false
  const slash = path.lastIndexOf('/')
  const base = slash >= 0 ? path.slice(slash + 1) : path
  return OXLINT_CONFIG_BASENAMES[base] === true
}

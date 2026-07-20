/**
 * ACL: detect and extract shell commands from context-mode tool invocations.
 *
 * Context-mode tools (ctx_execute, ctx_batch_execute) can execute shell
 * commands that should be inspected by shell-guard hooks.
 */
const CONTEXT_MODE_SHELL_TOOLS: Record<string, true> = {
  ctx_execute: true,
  ctx_batch_execute: true,
}

export function isContextModeShellTool(toolName: string, input: Record<string, unknown>): boolean {
  if (!CONTEXT_MODE_SHELL_TOOLS[toolName]) return false
  if (toolName === 'ctx_execute') return input['language'] === 'shell'
  return true
}

export function extractShellCommand(toolName: string, input: Record<string, unknown>): string | undefined {
  if (!isContextModeShellTool(toolName, input)) return undefined

  if (toolName === 'ctx_execute') {
    return typeof input['code'] === 'string' ? input['code'] : undefined
  }

  if (Array.isArray(input['commands'])) {
    return input['commands']
      .map((
        entry,
      ) => (typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>)['command'] : ''))
      .filter((cmd): cmd is string => typeof cmd === 'string')
      .join('\n')
  }

  return undefined
}

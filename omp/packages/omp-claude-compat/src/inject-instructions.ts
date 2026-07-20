/**
 * OMP Extension: Inject @-referenced files from CLAUDE.md into system prompt.
 *
 * Claude Code expands `@path` references in CLAUDE.md natively.
 * OMP does not — this extension reads all CLAUDE.md files, extracts @-refs,
 * resolves them, and injects their content into the system prompt via
 * before_agent_start.
 */
import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve, sep } from 'node:path'

interface Ref {
  sourcePath: string
  resolvedPath: string
}

/**
 * Find all @-references in a CLAUDE.md file.
 *
 * Supports:
 *   - Plain @-ref:         `@path/to/file.md`
 *   - Bullet-list @-ref:   `- @path/to/file.md`
 *
 * Only extracts refs where the @-token is the first thing on the line after
 * stripping leading list markers (`- `, `* `, `+ `) — conservative contract
 * that avoids matching inline prose references.
 */
function extractRefs(filePath: string, projectDir: string): Ref[] {
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }
  const baseDir = dirname(filePath)
  const refs: Ref[] = []

  for (const rawLine of content.split('\n')) {
    // Strip leading list markers before checking for @-ref
    const trimmed = rawLine.trim()
    const noMarker = trimmed.replace(/^[-*+]\s+/, '')
    if (!noMarker.startsWith('@')) continue
    const ref = noMarker.slice(1).trim()
    if (!ref || ref.includes(' ')) continue

    // Security: reject absolute paths and path-traversal attempts
    if (isAbsolute(ref)) continue

    // Resolve relative to CLAUDE.md directory
    const baseResolved = resolve(baseDir, ref)
    // Check confinement against projectDir
    if (
      (baseResolved.startsWith(projectDir + sep) || baseResolved === projectDir) &&
      existsSync(baseResolved)
    ) {
      refs.push({ sourcePath: filePath, resolvedPath: baseResolved })
      continue
    }

    // Fall back to project root
    const rootResolved = resolve(projectDir, ref)
    if (
      (rootResolved.startsWith(projectDir + sep) || rootResolved === projectDir) &&
      existsSync(rootResolved)
    ) {
      refs.push({ sourcePath: filePath, resolvedPath: rootResolved })
    }
  }

  return refs
}

/**
 * Read all @-referenced files and format them for injection.
 */
function loadReferencedContent(projectDir: string): string {
  const claudeMdPaths = [
    resolve(projectDir, 'CLAUDE.md'),
    resolve(projectDir, '.claude', 'CLAUDE.md'),
  ]

  const allRefs: Ref[] = []
  for (const filePath of claudeMdPaths) {
    if (existsSync(filePath)) {
      allRefs.push(...extractRefs(filePath, projectDir))
    }
  }

  // Deduplicate by resolved path (keep first occurrence)
  const seen = new Set<string>()
  const uniqueRefs: Ref[] = []
  for (const ref of allRefs) {
    if (!seen.has(ref.resolvedPath)) {
      seen.add(ref.resolvedPath)
      uniqueRefs.push(ref)
    }
  }

  if (uniqueRefs.length === 0) return ''

  const parts: string[] = ['# Injected @-references from CLAUDE.md']
  parts.push(
    'The following files were @-imported by CLAUDE.md and contain project rules.',
  )
  parts.push('')

  for (const ref of uniqueRefs) {
    const relativePath = ref.resolvedPath.slice(projectDir.length + 1)
    parts.push(`## ${relativePath}`)
    try {
      const content = readFileSync(ref.resolvedPath, 'utf-8')
      parts.push(content)
    } catch {
      parts.push(`[error reading ${relativePath}]`)
    }
    parts.push('')
  }

  return parts.join('\n')
}

export default function injectInstructionsExtension(pi: ExtensionAPI) {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
  // Referenced files do not change during a session; assemble once.
  let cached: string | undefined

  pi.on('before_agent_start', async (event: BeforeAgentStartEvent) => {
    if (cached === undefined) cached = loadReferencedContent(projectDir)
    if (!cached) return undefined

    return {
      systemPrompt: [...event.systemPrompt, '', cached],
    } as BeforeAgentStartEventResult
  })
}

/**
 * Tests for inject-instructions extension: @-ref extraction, path resolution,
 * security confinement, caching, and content formatting.
 *
 * Every test creates its own temp directory with a CLAUDE.md and referenced
 * files — no dependency on the host environment.
 *
 * Uses dynamic import (`await import(...)`) because the extension's `cached`
 * variable is module-scoped — each test must get a fresh module instance via
 * `vi.resetModules()` to avoid cross-test cache contamination.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Local type mirrors (same pattern as hook-dispatcher.test.ts)
// ---------------------------------------------------------------------------

interface BeforeAgentStartEvent {
  readonly type: 'before_agent_start'
  readonly prompt: string
  readonly systemPrompt: string[]
}

interface BeforeAgentStartEventResult {
  readonly systemPrompt?: string[]
}

interface MockExtensionAPI {
  readonly handlers: Map<string, Array<(event: unknown, ctx: unknown) => unknown>>
  on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void
  readonly recordedLogs: Array<{ level: string; message: unknown; context?: unknown }>
  readonly logger: {
    info: (message: unknown, context?: unknown) => void
    warn: (message: unknown, context?: unknown) => void
    error: (message: unknown, context?: unknown) => void
    debug: (message: unknown, context?: unknown) => void
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockApi(): MockExtensionAPI {
  const recordedLogs: MockExtensionAPI['recordedLogs'] = []
  const api: MockExtensionAPI = {
    handlers: new Map(),
    on(event, handler) {
      const list = this.handlers.get(event) ?? []
      list.push(handler)
      this.handlers.set(event, list)
    },
    get recordedLogs() {
      return recordedLogs
    },
    logger: {
      info(message, context) {
        recordedLogs.push({ level: 'info', message, context })
      },
      warn(message, context) {
        recordedLogs.push({ level: 'warn', message, context })
      },
      error(message, context) {
        recordedLogs.push({ level: 'error', message, context })
      },
      debug(message, context) {
        recordedLogs.push({ level: 'debug', message, context })
      },
    },
  }
  return api
}

function fireBeforeAgentStart(
  api: MockExtensionAPI,
  systemPrompt: string[] = ['# Original system prompt'],
): Promise<BeforeAgentStartEventResult | undefined> {
  const handlers = api.handlers.get('before_agent_start') ?? []
  const event: BeforeAgentStartEvent = {
    type: 'before_agent_start',
    prompt: 'test prompt',
    systemPrompt,
  }
  const ctx = { cwd: '/tmp' }
  return handlers[0]?.(event, ctx) as Promise<BeforeAgentStartEventResult | undefined>
}

/** Write a file at `subpath` under `dir`, creating parent directories. */
function writeFile(dir: string, subpath: string, content: string): void {
  const fullPath = resolve(dir, subpath)
  const parent = fullPath.slice(0, fullPath.lastIndexOf('/'))
  if (parent && parent !== fullPath) {
    mkdirSync(parent, { recursive: true })
  }
  writeFileSync(fullPath, content, 'utf-8')
}

// ---------------------------------------------------------------------------
// Extension factory — dynamic import + resetModules for cache isolation
// ---------------------------------------------------------------------------

async function createExtension(dir: string): Promise<MockExtensionAPI> {
  vi.resetModules()
  const api = makeMockApi()
  process.env['CLAUDE_PROJECT_DIR'] = dir
  const module = await import('../src/inject-instructions.js')
  module.default(api as never)
  return api
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inject-instructions (@-ref extraction, resolution, injection)', () => {
  it('Should_ExtractPlainRefs_When_ClaudeMdHasAtRefs', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '@rules/typescript.md\n')
      writeFile(dir, 'rules/typescript.md', '# TypeScript Rules\n\nUse strict mode.')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      expect(result!.systemPrompt).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      expect(joined).toContain('# TypeScript Rules')
      expect(joined).toContain('Use strict mode.')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ExtractBulletListRefs_When_LineStartsWithDash', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '- @rules/lint.md\n')
      writeFile(dir, 'rules/lint.md', 'Lint rules content')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      expect(joined).toContain('Lint rules content')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ExtractRefs_When_StarAndPlusMarkersUsed', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '* @config/eslint.md\n\n+ @config/prettier.md\n')
      writeFile(dir, 'config/eslint.md', 'ESLint: error')
      writeFile(dir, 'config/prettier.md', 'Prettier: warn')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      expect(joined).toContain('ESLint: error')
      expect(joined).toContain('Prettier: warn')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_SkipMissingFile_When_ReferencedFileNotFound', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '@rules/missing.md\n')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_RejectAbsolutePath_When_RefStartsWithSlash', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '@/etc/passwd\n')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_RejectPathTraversal_When_RefContainsDotDot', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '@../../../etc/passwd\n')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_DeduplicateRepeatedRefs_When_SameFileReferencedTwice', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '@rules/shared.md\n- @rules/shared.md\n')
      writeFile(dir, 'rules/shared.md', 'Dedup me')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      const occurrences = (joined.match(/Dedup me/g) ?? []).length
      expect(occurrences).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ReturnUndefined_When_NoClaudeMdExists', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ReturnUndefined_When_ClaudeMdHasNoRefs', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '# Project rules\nBe concise.\n')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_PreferClaudeMdDirectory_When_RefResolvesInBothLocations', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFile(dir, '.claude/CLAUDE.md', '@config.md\n')
      writeFile(dir, '.claude/config.md', '# From .claude')
      writeFile(dir, 'config.md', '# From root')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      expect(joined).toContain('From .claude')
      expect(joined).not.toContain('From root')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_FallbackToProjectRoot_When_RefNotFoundNextToClaudeMd', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '@rules/common.md\n')
      writeFile(dir, 'rules/common.md', '# Root fallback')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      expect(joined).toContain('Root fallback')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ReadBothClaudeMdFiles_When_BothExist', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFile(dir, 'CLAUDE.md', '@root-rules.md\n')
      writeFile(dir, '.claude/CLAUDE.md', '@dot-claude-rules.md\n')
      writeFile(dir, 'root-rules.md', 'Root rules content')
      writeFile(dir, 'dot-claude-rules.md', 'Dot claude rules content')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      expect(joined).toContain('Root rules content')
      expect(joined).toContain('Dot claude rules content')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_CacheContent_When_BeforeAgentStartCalledTwice', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '@rules/once.md\n')
      writeFile(dir, 'rules/once.md', '# Cached content')

      // Fresh module instance
      vi.resetModules()
      const api = makeMockApi()
      process.env['CLAUDE_PROJECT_DIR'] = dir
      const module = await import('../src/inject-instructions.js')
      module.default(api as never)

      // First call — loads content
      const result1 = await fireBeforeAgentStart(api)
      expect(result1).toBeDefined()
      const joined1 = result1!.systemPrompt!.join('\n')
      expect(joined1).toContain('Cached content')

      // Delete the referenced file to prove cache is hit
      rmSync(join(dir, 'rules/once.md'), { force: true })

      // Second call — must still serve cached content, not re-read
      const result2 = await fireBeforeAgentStart(api)
      expect(result2).toBeDefined()
      const joined2 = result2!.systemPrompt!.join('\n')
      expect(joined2).toContain('Cached content')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ExtractRef_When_LineHasWhitespaceBeforeListMarker', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    try {
      writeFile(dir, 'CLAUDE.md', '  - @config/testing.md\n')
      writeFile(dir, 'config/testing.md', 'Test config')

      const api = await createExtension(dir)
      const result = await fireBeforeAgentStart(api)

      expect(result).toBeDefined()
      const joined = result!.systemPrompt!.join('\n')
      expect(joined).toContain('Test config')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

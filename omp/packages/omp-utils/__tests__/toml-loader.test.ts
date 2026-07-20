/**
 * Tests for the shared `systemfsoftware.toml` loader.
 *
 * Verifies: (1) parse happy path, (2) missing file → `{}`, (3) malformed TOML → `{}`
 * + exactly one warn (dedup on second load), (4) per-cwd cache hit (second loadToml
 * same cwd does not re-read — cached value survives mtime change).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadToml, resetTomlCache } from '../src/toml-loader.js'

function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `omp-utils-toml-${prefix}-`))
}

function writeToml(dir: string, content: string): void {
  writeFileSync(join(dir, 'systemfsoftware.toml'), content, 'utf-8')
}

describe('loadToml', () => {
  beforeEach(() => {
    resetTomlCache()
  })

  it('Should_ParseValidToml_When_FileExists', () => {
    const dir = tmpDir('happy')
    writeToml(dir, 'plugins = ["one", "two"]\nfoo = ["bar"]')
    try {
      const config = loadToml(dir)
      expect(config).toEqual({ plugins: ['one', 'two'], foo: ['bar'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ReturnEmptyObject_When_FileMissing', () => {
    const dir = tmpDir('missing')
    try {
      const config = loadToml(dir)
      expect(config).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ReturnEmptyObjectAndWarnOnce_When_MalformedToml', () => {
    const dir = tmpDir('malformed')
    writeToml(dir, 'garbage [[ =\ninvalid')
    try {
      const warns: string[] = []
      const warn = (msg: string) => {
        warns.push(msg)
      }

      // First load: should return {} and produce at least one warn
      const config1 = loadToml(dir, warn)
      expect(config1).toEqual({})
      expect(warns.length).toBeGreaterThanOrEqual(1)

      const warnCountAfterFirst = warns.length

      // Second load with same cwd: should hit cache, warn NOT called again
      const config2 = loadToml(dir, warn)
      expect(config2).toEqual({})
      expect(warns.length).toBe(warnCountAfterFirst)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Should_ReturnCachedResult_When_SameCwdLoadedAgain', () => {
    const dir = tmpDir('cache')
    writeToml(dir, 'plugins = ["original"]')
    try {
      // First load populates cache
      const config1 = loadToml(dir)
      expect(config1).toEqual({ plugins: ['original'] })

      // Replace file with different content
      writeToml(dir, 'plugins = ["overwritten"]')

      // Second load with a recording warn function: warn should never fire
      // because the cache serves without touching the filesystem
      const warns: string[] = []
      const config2 = loadToml(dir, (msg) => {
        warns.push(msg)
      })

      // Must still return the ORIGINAL (cached) value, proving no re-read
      expect(config2).toEqual({ plugins: ['original'] })
      expect(warns.length).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

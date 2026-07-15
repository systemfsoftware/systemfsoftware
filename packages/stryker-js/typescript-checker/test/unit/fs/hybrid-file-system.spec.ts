import { describe, expect, it } from 'vitest'

import { HybridFileSystem } from '../../../src/fs/hybrid-file-system.js'

describe('HybridFileSystem', () => {
  function createSut(): HybridFileSystem {
    return new HybridFileSystem()
  }

  describe('writeFile', () => {
    it('should create a new in-memory file', () => {
      const sut = createSut()
      sut.writeFile('add.js', 'a + b')
      const file = sut.getFile('add.js')
      expect(file).toBeTruthy()
      expect(file!.content).toBe('a + b')
      expect(file!.fileName).toBe('add.js')
    })

    it('should override an existing file', () => {
      const sut = createSut()
      sut.writeFile('add.js', 'a + b')
      sut.writeFile('add.js', 'a - b')
      const file = sut.getFile('add.js')
      expect(file!.content).toBe('a - b')
    })

    it('should convert path separator to forward slashes', () => {
      const sut = createSut()
      sut.writeFile('test\\foo\\a.js', 'a')
      const actual = sut.getFile('test/foo/a.js')
      expect(actual).toBeTruthy()
      expect(actual!.content).toBe('a')
    })
  })

  describe('readFile', () => {
    it('should return in-memory content', () => {
      const sut = createSut()
      sut.writeFile('foo.js', 'in-memory')
      expect(sut.readFile('foo.js')).toBe('in-memory')
    })

    it('should return undefined for non-mutated files to allow disk fallback', () => {
      const sut = createSut()
      expect(sut.readFile('some-file-that-is-not-tracked.js')).toBeUndefined()
    })

    it('should return null for buildinfo files', () => {
      const sut = createSut()
      expect(sut.readFile('cache.tsbuildinfo')).toBeNull()
    })

    it('should return the tsconfig override when present', () => {
      const sut = createSut()
      sut.tsConfigOverrides.set('/project/tsconfig.json', '{"compilerOptions":{}}')
      expect(sut.readFile('/project/tsconfig.json')).toBe('{"compilerOptions":{}}')
    })
  })

  describe('fileExists', () => {
    it('should return true for in-memory files', () => {
      const sut = createSut()
      sut.writeFile('foo.js', '')
      expect(sut.fileExists('foo.js')).toBe(true)
    })

    it('should return false for buildinfo files', () => {
      const sut = createSut()
      expect(sut.fileExists('cache.tsbuildinfo')).toBe(false)
    })

    it('should return undefined for unknown files', () => {
      const sut = createSut()
      expect(sut.fileExists('unknown.js')).toBeUndefined()
    })
  })

  describe('mutateFile / resetFile', () => {
    it('should mutate a file and reset it afterwards', () => {
      const sut = createSut()
      sut.writeFile('add.js', 'function add(a: number, b: number) { return a + b; }')
      sut.mutateFile('add.js', {
        location: {
          start: { line: 0, column: 42 },
          end: { line: 0, column: 49 },
        },
        replacement: 'a - b',
      })
      expect(sut.readFile('add.js')).toContain('a - b')

      sut.resetFile('add.js')
      expect(sut.readFile('add.js')).toContain('a + b')
    })
  })

  describe('existsInMemory', () => {
    it('should return true if file exists in memory', () => {
      const sut = createSut()
      sut.writeFile('test-file', '')
      expect(sut.existsInMemory('test-file')).toBe(true)
    })

    it('should return false if file does not exist in memory', () => {
      const sut = createSut()
      expect(sut.existsInMemory('test-file')).toBe(false)
    })
  })
})

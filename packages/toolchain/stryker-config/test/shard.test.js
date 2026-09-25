import fc from 'fast-check'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { parseShard, shardMutate, sliceFiles } from '../lib/base.js'

const filePath = fc.stringMatching(/^src\/[a-z]{1,6}(\/[a-z]{1,6}){0,2}\.ts$/)
const files = fc.uniqueArray(filePath, { maxLength: 40 })
const packageName = fc.stringMatching(/^@[a-z]{1,8}\/[a-z-]{1,16}$/)
const count = fc.integer({ min: 1, max: 20 })

/** @param {number} n */
const shardsOf = (n) => Array.from({ length: n }, (_, i) => ({ index: i + 1, count: n }))

describe('sliceFiles', () => {
  it('partitions the files: every file lands in exactly one shard of a count', () => {
    fc.assert(fc.property(files, packageName, count, (all, name, n) => {
      const owners = shardsOf(n).flatMap((shard) => sliceFiles(all, name, shard))
      assert.deepEqual([...owners].sort(), [...all].sort())
    }))
  })

  it('assigns a file the same shard however the input is ordered', () => {
    fc.assert(fc.property(files, packageName, count, (all, name, n) => {
      const reversed = [...all].reverse()
      for (const shard of shardsOf(n)) assert.deepEqual(sliceFiles(reversed, name, shard), sliceFiles(all, name, shard))
    }))
  })

  it('keeps every slice within one file of the others', () => {
    fc.assert(fc.property(files, packageName, count, (all, name, n) => {
      const sizes = shardsOf(n).map((shard) => sliceFiles(all, name, shard).length)
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1)
    }))
  })
})

describe('parseShard', () => {
  it('reads an unset or empty STRYKER_SHARD as no shard', () => {
    assert.equal(parseShard(undefined), undefined)
    assert.equal(parseShard(''), undefined)
  })

  it('reads <index>/<count> for every index within its count', () => {
    fc.assert(fc.property(count, count, (a, b) => {
      const [index, n] = a <= b ? [a, b] : [b, a]
      assert.deepEqual(parseShard(`${index}/${n}`), { index, count: n })
    }))
  })

  it('refuses a value outside <index>/<count>, naming it', () => {
    for (const raw of ['0/4', '5/4', '1/0', 'x', '1/2/3', ' 1/2']) {
      assert.throws(() => parseShard(raw), { message: new RegExp(`got '${raw.replace('/', '\\/')}'`) })
    }
  })
})

/**
 * Stryker's reading of `mutate`: patterns apply in order, a negation removing
 * what earlier patterns added.
 * @param {readonly string[]} patterns
 * @param {readonly string[]} candidates
 */
const mutatedBy = (patterns, candidates) =>
  candidates.filter((file) =>
    patterns.reduce(
      (kept, pattern) =>
        pattern.startsWith('!')
          ? kept && !path.matchesGlob(file, pattern.slice(1))
          : kept || path.matchesGlob(file, pattern),
      false,
    )
  )

describe('shardMutate', () => {
  const patterns = ['src/**/*.ts', '!src/**/*.test.ts']
  const tracked = ['src/a.ts', 'src/b.ts', 'src/c.test.ts', 'src/deep/d.ts', 'src/deep/e.ts', 'src/f.ts', 'src/g.ts']

  /** @param {(dir: string) => void} body */
  const inPackage = (body) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'shard-mutate-'))
    const cwd = process.cwd()
    const shard = process.env['STRYKER_SHARD']
    try {
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@scope/pkg' }))
      for (const file of tracked) {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        writeFileSync(path.join(dir, file), '')
      }
      process.chdir(dir)
      body(dir)
    } finally {
      process.chdir(cwd)
      if (shard === undefined) delete process.env['STRYKER_SHARD']
      else process.env['STRYKER_SHARD'] = shard
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('leaves the patterns as written when STRYKER_SHARD is unset', () => {
    delete process.env['STRYKER_SHARD']
    assert.deepEqual(shardMutate(patterns), patterns)
  })

  it('has every file the patterns match mutated by exactly one shard', () => {
    inPackage(() => {
      const wanted = mutatedBy(patterns, tracked)
      for (const n of [1, 2, 3, 6, 7, 9]) {
        const mutated = shardsOf(n).flatMap((shard) => {
          process.env['STRYKER_SHARD'] = `${shard.index}/${shard.count}`
          return mutatedBy(shardMutate(patterns), tracked)
        })
        assert.deepEqual([...mutated].sort(), [...wanted].sort(), `count ${n}`)
      }
    })
  })

  it('keeps the original patterns ahead of its negations', () => {
    inPackage(() => {
      process.env['STRYKER_SHARD'] = '1/3'
      const sharded = shardMutate(patterns)
      assert.deepEqual(sharded.slice(0, patterns.length), patterns)
      assert.ok(sharded.slice(patterns.length).every((pattern) => pattern.startsWith('!src/')))
    })
  })

  it('refuses a mutation range, which a file slice cannot honour', () => {
    inPackage(() => {
      process.env['STRYKER_SHARD'] = '1/2'
      assert.throws(() => shardMutate(['src/a.ts:1-5']), /cannot slice mutation ranges: src\/a\.ts:1-5/)
    })
  })
})

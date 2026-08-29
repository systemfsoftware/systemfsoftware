/**
 * Corpus property tests for the owned ESTree printer.
 *
 * Proven before anything depends on it — this suite runs parse→print→re-parse
 * round-trips over the live owned trees and the committed vocabulary fixtures.
 */

// oxlint-disable

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'

import { printProgram } from '../src/print/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CorpusEntry {
  filename: string
  source: string
}

const SKIP_PATTERNS: readonly RegExp[] = [
  /node_modules/,
  /dist\//,
  /\.git\//,
  /repos\//,
  /\.next\//,
  /coverage\//,
]

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(path))
}

function collectFiles(dir: string, exts: readonly string[], out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (shouldSkip(full)) continue
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      collectFiles(full, exts, out)
    } else if (exts.some((e) => full.endsWith(e))) {
      out.push(full)
    }
  }
}

function collectCorpus(): CorpusEntry[] {
  // Resolve repo root: from instrumenter package, go up to repo root
  // In vitest, cwd is the package dir; in plain node, cwd is repo root.
  // We try both.
  const cwd = process.cwd()
  const repoRoot = cwd.endsWith('instrumenter') ? join(cwd, '../../../../../') : cwd
  const roots = [join(repoRoot, 'packages'), join(repoRoot, 'scripts')]
  const exts = ['.ts', '.tsx', '.js', '.mts']
  const MAX_FILES = 800
  const files: string[] = []

  for (const root of roots) {
    collectFiles(root, exts, files)
  }

  // Deterministic sort
  files.sort()
  const capped = files.slice(0, MAX_FILES)

  // Add committed vocabulary fixtures
  const fixtureDir = join(repoRoot, 'packages/testing/mutation/stryker-js/instrumenter/tests/print-corpus')
  let fixtureFiles: string[] = []
  try {
    fixtureFiles = readdirSync(fixtureDir)
      .filter((f) => exts.some((e) => f.endsWith(e)))
      .map((f) => join(fixtureDir, f))
      .sort()
  } catch {
    // no fixtures yet
  }

  const allPaths = [...capped, ...fixtureFiles]
  const entries: CorpusEntry[] = []
  for (const p of allPaths) {
    try {
      const source = readFileSync(p, 'utf-8')
      entries.push({ filename: p, source })
    } catch {
      continue
    }
  }
  return entries
}

function langForFile(filename: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  if (filename.endsWith('.tsx')) return 'tsx'
  if (filename.endsWith('.ts') || filename.endsWith('.mts')) return 'ts'
  if (filename.endsWith('.jsx')) return 'jsx'
  return 'js'
}

function stripSpans(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(stripSpans)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'start' || k === 'end' || k === 'range') continue
      if (k === 'raw' && obj['type'] === 'Literal') continue
      out[k] = stripSpans(v)
    }
    return out
  }
  return value
}

function canonical(value: unknown): string {
  // Deterministic serialization: sorted keys, handles bigint
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return `__bigint:${val.toString()}`
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k]
      }
      return sorted
    }
    return val as unknown
  })
}

// Benign normalizations that the printer introduces — each entry has a one-line why.
// Keep this list named and documented; it is the tolerance for shape equality.
// - ParenthesizedExpression: printer may drop redundant parens that do not affect precedence
//   (e.g. (a) as a standalone expression statement vs a). The re-parsed tree will not
//   contain ParenthesizedExpression for those.
// - Literal raw: printer normalizes string quoting and numeric formatting; raw may differ
//   while value is identical after re-parse — not a span field but tolerated in shape.
const SHAPE_TOLERANCE_NOTE = `Tolerances:
- ParenthesizedExpression nodes may be absent in the re-parsed tree when the original
  parentheses were semantically redundant — benign normalization.
- Literal raw strings may change quoting/style while preserving value.
`
void SHAPE_TOLERANCE_NOTE

// ---------------------------------------------------------------------------
// 1) Corpus totality: every file parses, prints, re-parses with zero errors
// ---------------------------------------------------------------------------

describe('print corpus — totality', () => {
  const corpus = collectCorpus()

  it(`covers ${corpus.length} files (live trees + fixtures)`, () => {
    expect(corpus.length).toBeGreaterThan(0)
  })

  for (const entry of corpus) {
    it(`round-trip parses and prints: ${relative(process.cwd(), entry.filename)}`, () => {
      const lang = langForFile(entry.filename)
      const first = parseSync(entry.filename, entry.source, { range: true })
      expect(first.errors.length, `parse errors in ${entry.filename}: ${first.errors.map((e) => e.message).join('; ')}`)
        .toBe(0)

      const printed = printProgram(first.program, {
        comments: first.comments as never,
        hashbang: first.program.hashbang as never,
      })

      const second = parseSync(entry.filename, printed, { range: true, lang: langForFile(entry.filename) })
      expect(
        second.errors.length,
        `re-parse errors after print for ${entry.filename}: ${second.errors.map((e) => e.message).join('; ')}`,
      ).toBe(0)
    })
  }
})

// ---------------------------------------------------------------------------
// 2) Shape equality: stripped re-parsed AST deep-equals original (mod tolerances)
// ---------------------------------------------------------------------------

describe('print corpus — shape equality', () => {
  const corpus = collectCorpus()

  for (const entry of corpus) {
    it(`shape-equal after round-trip: ${relative(process.cwd(), entry.filename)}`, () => {
      const lang = langForFile(entry.filename)
      const first = parseSync(entry.filename, entry.source, { range: true })
      if (first.errors.length > 0) return // totality suite already asserts zero errors

      const printed = printProgram(first.program, {
        comments: first.comments as never,
        hashbang: first.program.hashbang as never,
      })
      const second = parseSync(entry.filename, printed, { range: true, lang: langForFile(entry.filename) })
      if (second.errors.length > 0) return // totality already failed

      const origStripped = canonical(stripSpans(first.program))
      const reStripped = canonical(stripSpans(second.program))

      // Allow benign ParenthesizedExpression normalization: if the only diff is the
      // presence/absence of ParenthesizedExpression wrappers, it is not a failure.
      // We check by also comparing with ParenthesizedExpression stripped.
      if (origStripped !== reStripped) {
        const withoutParens = (json: string): string => {
          const parsed = JSON.parse(json) as unknown
          const strip = (v: unknown): unknown => {
            if (v === null || v === undefined) return v
            if (Array.isArray(v)) return v.map(strip)
            if (typeof v === 'object') {
              const obj = v as Record<string, unknown>
              if (obj['type'] === 'ParenthesizedExpression' && 'expression' in obj) {
                return strip(obj['expression'])
              }
              const out: Record<string, unknown> = {}
              for (const [k, val] of Object.entries(obj)) out[k] = strip(val)
              return out
            }
            return v
          }
          return canonical(strip(parsed))
        }
        const origNoParens = withoutParens(origStripped)
        const reNoParens = withoutParens(reStripped)
        if (origNoParens !== reNoParens) {
          // Report the canonical diff for diagnosis
          expect(reStripped).toBe(origStripped)
        }
      }
    })
  }
})

// ---------------------------------------------------------------------------
// 3) Idempotence: print(parse(print(parse(x)))) === print(parse(x))
// ---------------------------------------------------------------------------

describe('print corpus — idempotence', () => {
  const corpus = collectCorpus()

  for (const entry of corpus) {
    it(`idempotent print: ${relative(process.cwd(), entry.filename)}`, () => {
      const first = parseSync(entry.filename, entry.source, { range: true })
      if (first.errors.length > 0) return
      const once = printProgram(first.program, {
        comments: first.comments as never,
        hashbang: first.program.hashbang as never,
      })
      const reparsed = parseSync(entry.filename, once, { range: true, lang: langForFile(entry.filename) })
      if (reparsed.errors.length > 0) return
      const twice = printProgram(reparsed.program, {
        comments: reparsed.comments as unknown as never,
        hashbang: reparsed.program.hashbang as never,
      })
      expect(twice).toBe(once)
    })
  }
})

describe('print — synthesized node fidelity', () => {
  it('binary expression without spans', () => {
    const node = {
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Identifier', name: 'a' },
      right: { type: 'Identifier', name: 'b' },
    } as unknown as never
    const prog = {
      type: 'Program',
      body: [{ type: 'ExpressionStatement', expression: node }],
      sourceType: 'module',
      hashbang: null,
    } as unknown as import('@oxc-project/types').Program
    const out = printProgram(prog)
    expect(out).toContain('a + b')
  })

  it('literal swaps', () => {
    const makeProg = (value: unknown, raw: string | null): string => {
      const lit = { type: 'Literal', value, raw } as unknown as never
      const prog = {
        type: 'Program',
        body: [{ type: 'ExpressionStatement', expression: lit }],
        sourceType: 'module',
        hashbang: null,
      } as unknown as import('@oxc-project/types').Program
      return printProgram(prog)
    }
    expect(makeProg('hello', '"hello"')).toContain('"hello"')
    expect(makeProg(42, '42')).toContain('42')
    expect(makeProg(null, 'null')).toContain('null')
    expect(makeProg(true, 'true')).toContain('true')
  })

  it('empty block statement', () => {
    const prog = {
      type: 'Program',
      body: [{ type: 'BlockStatement', body: [] }],
      sourceType: 'module',
      hashbang: null,
    } as unknown as import('@oxc-project/types').Program
    expect(printProgram(prog)).toContain('{}')
  })

  it('empty array expression', () => {
    const node = { type: 'ArrayExpression', elements: [] } as unknown as never
    const prog = {
      type: 'Program',
      body: [{ type: 'ExpressionStatement', expression: node }],
      sourceType: 'module',
      hashbang: null,
    } as unknown as import('@oxc-project/types').Program
    expect(printProgram(prog)).toContain('[]')
  })

  it('call expression forms', () => {
    const node = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'foo' },
      arguments: [{ type: 'Identifier', name: 'a' }, {
        type: 'SpreadElement',
        argument: { type: 'Identifier', name: 'rest' },
      }],
      optional: false,
    } as unknown as never
    const prog = {
      type: 'Program',
      body: [{ type: 'ExpressionStatement', expression: node }],
      sourceType: 'module',
      hashbang: null,
    } as unknown as import('@oxc-project/types').Program
    const out = printProgram(prog)
    expect(out).toContain('foo(a, ...rest)')
  })

  it('new expression', () => {
    const node = {
      type: 'NewExpression',
      callee: { type: 'Identifier', name: 'Foo' },
      arguments: [{ type: 'Literal', value: 1, raw: '1' }],
    } as unknown as never
    const prog = {
      type: 'Program',
      body: [{ type: 'ExpressionStatement', expression: node }],
      sourceType: 'module',
      hashbang: null,
    } as unknown as import('@oxc-project/types').Program
    expect(printProgram(prog)).toContain('new Foo(1)')
  })

  it('precedence: a - (b - c) preserves parens', () => {
    const src = 'const x = a - (b - c);'
    const parsed = parseSync('test.js', src, { range: true })
    const out = printProgram(parsed.program, {
      comments: parsed.comments as unknown as never,
      hashbang: parsed.program.hashbang as never,
    })
    expect(out).toContain('a - (b - c)')
  })

  it('precedence: (a + b) * c preserves parens', () => {
    const src = 'const x = (a + b) * c;'
    const parsed = parseSync('test.js', src, { range: true })
    const out = printProgram(parsed.program, {
      comments: parsed.comments as unknown as never,
      hashbang: parsed.program.hashbang as never,
    })
    expect(out).toContain('(a + b) * c')
  })
})

describe('print — comment/directive/hashbang survival', () => {
  it('hashbang, JSDoc, line comments, directive, block comment all survive', () => {
    const src = readFileSync(
      join(import.meta.dirname, 'print-corpus/comments-directive-hashbang.ts'),
      'utf-8',
    )
    const parsed = parseSync('test.ts', src, { range: true })
    expect(parsed.errors.length).toBe(0)
    const out = printProgram(parsed.program, {
      comments: parsed.comments as unknown as never,
      hashbang: parsed.program.hashbang as never,
    })
    expect(out).toContain('#!/usr/bin/env node')
    expect(out).toContain('"use strict"')
    expect(out).toContain('JSDoc comment')
    expect(out).toContain('line comment before')
    const reparsed = parseSync('test.ts', out, { range: true })
    expect(reparsed.errors.length).toBe(0)
  })
})

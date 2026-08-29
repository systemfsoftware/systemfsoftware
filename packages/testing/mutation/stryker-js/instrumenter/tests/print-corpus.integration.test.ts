import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseSync } from 'oxc-parser'
import { expect } from 'vitest'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { printProgram } from './__fixtures__/print.js'

const Feature = makeFeature({ it, layer })

// ---------------------------------------------------------------------------
// Corpus collection — the live owned trees plus the committed vocabulary
// fixtures. Every file the printer may ever see in this workspace.
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
  // Resolve repo root: from the instrumenter package in a worktree, walk up
  // until the directory containing `pnpm-workspace.yaml`.
  let dir = process.cwd()
  let repoRoot = dir
  for (;;) {
    if (readdirSync(dir).includes('pnpm-workspace.yaml')) {
      repoRoot = dir
      break
    }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  const roots = [join(repoRoot, 'packages'), join(repoRoot, 'scripts')]
  const exts = ['.ts', '.tsx', '.js', '.mts']
  const files: string[] = []

  for (const root of roots) {
    collectFiles(root, exts, files)
  }

  // Deterministic sort
  files.sort()

  // Committed vocabulary fixtures
  const fixtureDir = join(repoRoot, 'packages/testing/mutation/stryker-js/instrumenter/tests/__fixtures__/print-corpus')
  let fixtureFiles: string[] = []
  try {
    fixtureFiles = readdirSync(fixtureDir)
      .filter((f) => exts.some((e) => f.endsWith(e)))
      .map((f) => join(fixtureDir, f))
      .sort()
  } catch {
    // no fixtures yet
  }

  const allPaths = [...files, ...fixtureFiles]
  const entries: CorpusEntry[] = []
  for (const p of allPaths) {
    try {
      entries.push({ filename: p, source: readFileSync(p, 'utf-8') })
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

// Benign normalization: ParenthesizedExpression wrappers whose parentheses were
// semantically redundant may be absent from the re-parsed tree. Compared by
// stripping them from both trees; any other structural difference fails.
function withoutParens(json: string): string {
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

Feature('The owned printer round-trips every workspace tree', { timeout: 120_000 })
  .body(({ scenario }) => {
    scenario(
      'Every corpus file parses, prints, and re-parses with zero errors',
      Gherkin.Do.pipe(
        Given('the workspace corpus')('corpus', () => Effect.succeed(collectCorpus())),
        Then('no file produces a parse or re-parse error')(({ corpus }: { corpus: readonly CorpusEntry[] }) =>
          Effect.sync(() => {
            const failures: string[] = []
            for (const entry of corpus) {
              try {
                const first = parseSync(entry.filename, entry.source, { range: true })
                if (first.errors.length > 0) {
                  failures.push(`${entry.filename}: parse ${first.errors[0]?.message}`)
                  continue
                }
                const printed = printProgram(first.program, {
                  comments: first.comments,
                  hashbang: first.program.hashbang,
                })
                const second = parseSync(entry.filename, printed, { range: true, lang: langForFile(entry.filename) })
                if (second.errors.length > 0) {
                  failures.push(`${entry.filename}: re-parse ${second.errors[0]?.message}`)
                }
              } catch (cause) {
                failures.push(`${entry.filename}: ${cause instanceof Error ? cause.message : 'threw'}`)
              }
            }
            expect(failures).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Every corpus file prints a shape-equal tree',
      Gherkin.Do.pipe(
        Given('the workspace corpus')('corpus', () => Effect.succeed(collectCorpus())),
        Then('the re-parsed tree equals the original modulo spans and benign parens')((
          { corpus }: { corpus: readonly CorpusEntry[] },
        ) =>
          Effect.sync(() => {
            const failures: string[] = []
            for (const entry of corpus) {
              const first = parseSync(entry.filename, entry.source, { range: true })
              if (first.errors.length > 0) continue // totality scenario owns parse errors
              const printed = printProgram(first.program, {
                comments: first.comments,
                hashbang: first.program.hashbang,
              })
              const second = parseSync(entry.filename, printed, { range: true, lang: langForFile(entry.filename) })
              if (second.errors.length > 0) continue
              const origStripped = canonical(stripSpans(first.program))
              const reStripped = canonical(stripSpans(second.program))
              if (origStripped === reStripped) continue
              if (withoutParens(origStripped) === withoutParens(reStripped)) continue
              failures.push(entry.filename)
            }
            expect(failures).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Printing is idempotent for every corpus file',
      Gherkin.Do.pipe(
        Given('the workspace corpus')('corpus', () => Effect.succeed(collectCorpus())),
        Then('printing the printed output reproduces it exactly')((
          { corpus }: { corpus: readonly CorpusEntry[] },
        ) =>
          Effect.sync(() => {
            const failures: string[] = []
            for (const entry of corpus) {
              const first = parseSync(entry.filename, entry.source, { range: true })
              if (first.errors.length > 0) continue
              const once = printProgram(first.program, {
                comments: first.comments,
                hashbang: first.program.hashbang,
              })
              const reparsed = parseSync(entry.filename, once, { range: true, lang: langForFile(entry.filename) })
              if (reparsed.errors.length > 0) continue
              const twice = printProgram(reparsed.program, {
                comments: reparsed.comments,
                hashbang: reparsed.program.hashbang as never,
              })
              if (twice !== once) failures.push(entry.filename)
            }
            expect(failures).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Synthesized nodes — the shapes mutators build — print faithfully',
      Gherkin.Do.pipe(
        Given('synthesized replacement snippets')('snippets', () =>
          Effect.succeed([
            {
              name: 'binary expression without spans',
              node: {
                type: 'Program',
                body: [
                  {
                    type: 'ExpressionStatement',
                    expression: {
                      type: 'BinaryExpression',
                      operator: '+',
                      left: { type: 'Identifier', name: 'a' },
                      right: { type: 'Identifier', name: 'b' },
                    },
                  },
                ],
                sourceType: 'module',
                hashbang: null,
              },
              expected: 'a + b',
            },
            {
              name: 'empty block statement',
              node: {
                type: 'Program',
                body: [{ type: 'BlockStatement', body: [] }],
                sourceType: 'module',
                hashbang: null,
              },
              expected: '{}',
            },
            {
              name: 'empty array expression',
              node: {
                type: 'Program',
                body: [{ type: 'ExpressionStatement', expression: { type: 'ArrayExpression', elements: [] } }],
                sourceType: 'module',
                hashbang: null,
              },
              expected: '[]',
            },
            {
              name: 'call expression with spread',
              node: {
                type: 'Program',
                body: [
                  {
                    type: 'ExpressionStatement',
                    expression: {
                      type: 'CallExpression',
                      callee: { type: 'Identifier', name: 'foo' },
                      arguments: [{ type: 'Identifier', name: 'a' }, {
                        type: 'SpreadElement',
                        argument: { type: 'Identifier', name: 'rest' },
                      }],
                      optional: false,
                    },
                  },
                ],
                sourceType: 'module',
                hashbang: null,
              },
              expected: 'foo(a, ...rest)',
            },
            {
              name: 'new expression',
              node: {
                type: 'Program',
                body: [
                  {
                    type: 'ExpressionStatement',
                    expression: {
                      type: 'NewExpression',
                      callee: { type: 'Identifier', name: 'Foo' },
                      arguments: [{ type: 'Literal', value: 1, raw: '1' }],
                    },
                  },
                ],
                sourceType: 'module',
                hashbang: null,
              },
              expected: 'new Foo(1)',
            },
          ] as ReadonlyArray<{ name: string; node: unknown; expected: string }>)),
        When('each snippet is printed')(
          'outputs',
          ({ snippets }: { snippets: ReadonlyArray<{ name: string; node: unknown; expected: string }> }) =>
            Effect.succeed(
              snippets.map((snippet) => ({
                name: snippet.name,
                expected: snippet.expected,
                out: printProgram(snippet.node as never),
              })),
            ),
        ),
        Then('each output contains the expected rendering')((
          { outputs }: { outputs: ReadonlyArray<{ name: string; expected: string; out: string }> },
        ) =>
          Effect.sync(() => {
            for (const { name, expected, out } of outputs) {
              expect(
                out.split(expected).length - 1,
                `${name}: expected ${JSON.stringify(expected)} in ${JSON.stringify(out.slice(0, 200))}`,
              ).toBeGreaterThan(0)
            }
          })
        ),
      ),
    )

    scenario(
      'Precedence reconstruction keeps the parentheses that carry meaning',
      Gherkin.Do.pipe(
        Given('expressions whose parens are semantically load-bearing')('sources', () =>
          Effect.succeed([
            { src: 'const x = a - (b - c);', expected: 'a - (b - c)' },
            { src: 'const x = (a + b) * c;', expected: '(a + b) * c' },
          ])),
        When('each is parsed and printed')(
          'outputs',
          ({ sources }: { sources: ReadonlyArray<{ src: string; expected: string }> }) =>
            Effect.succeed(
              sources.map(({ src, expected }) => {
                const parsed = parseSync('precedence-probe.ts', src, { range: true })
                return {
                  expected,
                  out: printProgram(parsed.program, {
                    comments: parsed.comments,
                    hashbang: parsed.program.hashbang as never,
                  }),
                }
              }),
            ),
        ),
        Then('each printed form still contains its parentheses')((
          { outputs }: { outputs: ReadonlyArray<{ expected: string; out: string }> },
        ) =>
          Effect.sync(() => {
            for (const { expected, out } of outputs) {
              expect(out).toContain(expected)
            }
          })
        ),
      ),
    )

    scenario(
      'Comments, directives, and the hashbang survive printing',
      Gherkin.Do.pipe(
        Given('the comments fixture')('source', () =>
          Effect.succeed(
            readFileSync(
              join(import.meta.dirname, '__fixtures__/print-corpus/comments-directive-hashbang.ts'),
              'utf-8',
            ),
          )),
        When('it is printed')('out', ({ source }: { source: string }) =>
          Effect.sync(() => {
            const parsed = parseSync('comments-probe.ts', source, { range: true })
            expect(parsed.errors.length).toBe(0)
            return printProgram(parsed.program, {
              comments: parsed.comments,
              hashbang: parsed.program.hashbang as never,
            })
          })),
        Then('every comment, the directive, and the hashbang appear in the output')((
          { out }: { out: string },
        ) =>
          Effect.sync(() => {
            expect(out).toContain('#!/usr/bin/env node')
            expect(out).toContain('"use strict"')
            expect(out).toContain('JSDoc comment')
            expect(out).toContain('line comment before')
            const reparsed = parseSync('comments-probe.ts', out, { range: true })
            expect(reparsed.errors.length).toBe(0)
          })
        ),
      ),
    )
  })

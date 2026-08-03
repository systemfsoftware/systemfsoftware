#!/usr/bin/env node
// Bans hand-rolled JSON-with-comments parsing. Use `parse` from `@std/jsonc`.
//
// THIS IS A TRIPWIRE, NOT A PROOF OF ABSENCE. It keys on the three shapes this
// repo has actually produced. A determined re-implementation (a regex built from
// fragments via `new RegExp`, the strip and the parse split across two files) gets
// through. A green run means "none of the three known shapes is present", never
// "no hand-rolled parser exists".
//
// It exists because per-package lint cannot reach the code that broke:
// `scripts/check-lint-coverage.mjs` exempts `packages/stryker-js/` as a vendored
// fork, and `packages/stryker-js/core` has no lint script at all. A root script
// scans every file regardless.
//
// Why three signatures: the two strippers deleted from this repo did NOT share an
// implementation, and a regex-only signature would have missed one of them.
//
//   S1  regex form    checker  -- two `.replace` calls, not string-aware, so a
//                               `/**/` inside a glob was deleted as a comment
//   S2  scanner form  core     -- a character walk with zero regexes, string-aware
//                               but dropped the char after every backslash escape
//   S3  name form              -- the obvious re-introduction under either shape
//
// A file trips only when a signature co-occurs with a `JSON.parse` call: that
// pairing -- strip the comments, then hand the result to a parser that rejects
// them -- is the defect. Either half alone is legitimate.

import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const SCANNED = /\.(ts|mts|cts|js|mjs|cjs)$/
const IGNORED = /(^|\/)(node_modules|dist|repos|coverage|reports|\.stryker-tmp|\.worktrees|\.git)(\/|$)/

// Each exemption states why `@std/jsonc` is not its remedy. An exemption that
// parks a live defect is a silent bypass (CONSTITUTION §V.6), so keep this list
// short and keep the reasons true.
const EXEMPT = new Map([
  [
    'scripts/guard-no-hand-rolled-jsonc.mjs',
    'this file -- it necessarily contains the patterns it bans. Consequence, stated rather than hidden: a stripper added to the guard itself is not caught.',
  ],
  [
    'packages/oxlint-plugins/recommended/scripts/guard-no-behavior.mjs',
    'strips comments from JavaScript source, not JSONC -- `@std/jsonc` cannot parse JS, so it is not the remedy here. ' +
    'That file DOES have a live ordering bug of the same class (it strips comments before replacing string literals, ' +
    'so a `//` inside a scanned string mangles the line and the gate false-negatives). It is left alone deliberately: ' +
    'the correct fix is the workspace `oxc-parser`, and merely reordering the passes is a lateral move -- replacing ' +
    "literals first breaks on any apostrophe in a comment (`don't`) -- that its own package cannot test, because it " +
    'lists `test` in `forbiddenScripts` by design. Declared here rather than hidden (CONSTITUTION §V.6).',
  ],
])

const JSON_PARSE = /\bJSON\s*\.\s*parse\s*\(/
const STRIP_NAME = /\bstrip[A-Za-z]*[Cc]omments?\b/

// S1: a comment-stripping regex literal, in one of the two shapes that strip
// comments. Keying on a bare escaped `\/\/` is too loose -- measured, it also hit
// the legitimate `/\/\/# sourceMappingURL=(.+)$/m` in tsconfig-helpers.ts. The
// block form must carry BOTH delimiters; the line form must be followed straight
// away by a rest-of-line wildcard, which is what makes it a stripper rather than
// a match for some specific `//`-prefixed token.
const REGEX_BLOCK = ['\\/\\*', '\\*\\/']
const REGEX_LINE = /\\\/\\\/(?:\.\*|\[\^)/
const isRegexForm = (text) => (REGEX_BLOCK.every((d) => text.includes(d))) || REGEX_LINE.test(text)

// S2: the comment-open bigram in comparison position -- a character compared
// against `/`, then, WITHIN THE SAME BOOLEAN EXPRESSION, another compared against
// `*` or a second `/`. That adjacency is what a hand-rolled comment scanner looks
// like. The gap forbids `;` and `{` so the two comparisons must belong to one
// expression rather than merely landing near each other.
//
// Both constraints were measured, not guessed. Counting slash literals instead
// flagged 4 unrelated path-splitting loops (arethetypeswrong, check-exports.mjs);
// allowing any 48 characters between them flagged two adjacent but independent
// `if` statements. The selftest pins both boundaries as negatives.
const SCANNER_BIGRAM = /[=!]==?\s*(['"`])\/\1[^;{]{0,32}?[=!]==?\s*(['"`])[*/]\2/
const SCANNER_LINE = /[=!]==?\s*(['"`])[*/]\1/

/**
 * Returns the signature that fired, or null. Kept as a plain function so
 * `--selftest` can drive it directly without a test runner.
 */
export const detect = (source) => {
  if (!JSON_PARSE.test(source)) return null
  if (isRegexForm(source)) return 'S1-regex'
  if (SCANNER_BIGRAM.test(source)) return 'S2-scanner'
  if (STRIP_NAME.test(source)) return 'S3-name'
  return null
}

const lineOf = (source, signature) => {
  const probe = {
    'S1-regex': (line) => line.includes(REGEX_BLOCK[0]) || REGEX_LINE.test(line),
    'S2-scanner': (line) => SCANNER_LINE.test(line),
    'S3-name': (line) => STRIP_NAME.test(line),
  }[signature]
  const index = source.split('\n').findIndex(probe)
  return index === -1 ? 1 : index + 1
}

// ── selftest ────────────────────────────────────────────────────────────────
// Runs on every `pnpm check`, before the scan. There is no test convention for
// root scripts to follow -- none of check-exports.mjs, guard-mutate-scope.mjs, or
// check-lint-coverage.mjs carries a test, no root vitest config exists, and
// nothing collects tests from scripts/ -- so the fixtures live here and execute
// with the guard rather than sitting in a file nothing invokes.
const P = 'JSON.parse(text)'

const FIXTURES = [
  // positives -- one per signature
  ['S1-regex', `const s = json.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ''); ${P}`, 'S1: regex pair, the checker shape'],
  ['S1-regex', `const s = json.replace(/\\/\\/.*$/gm, ''); ${P}`, 'S1: line-comment regex, the other half of the pair'],
  [
    'S2-scanner',
    `let i = 0
     while (i < json.length) {
       const ch = json[i], next = json[i + 1]
       if (ch === '/' && next === '/') { i++; continue }
       if (ch === '/' && next === '*') { i += 2; continue }
       out += ch; i++
     }
     ${P}`,
    'S2: character scanner with ZERO regexes -- the shape core shipped',
  ],
  ['S3-name', `const clean = stripJsonComments(text); ${P}`, 'S3: name form'],

  // negatives -- each pins a boundary that a looser signature got wrong
  [null, `const s = json.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')`, 'comment regex with no JSON.parse'],
  [null, `const cfg = ${P}`, 'JSON.parse with no stripping of any kind'],
  [null, `const [head] = p.split('/'); if (ch === '/') go(); ${P}`, 'repeated slash literal, no bigram'],
  [null, `if (ch === '/') a(); if (glob === '*') b(); ${P}`, 'slash and star compared, but not adjacent'],
  [null, `// a real comment mentioning /* and */\nconst cfg = ${P}`, 'comment markers in prose, not in literals'],
  [
    null,
    `const findSourceMapRegex = /\\/\\/# sourceMappingURL=(.+)$/m; ${P}`,
    'sourceMappingURL regex -- escapes a double slash but matches a specific token, not a comment',
  ],
]

const selftest = () => {
  const failures = []
  for (const [expected, source, label] of FIXTURES) {
    const actual = detect(source)
    if (actual !== expected) {
      failures.push(`  ${label}\n    expected ${expected ?? 'no match'}, got ${actual ?? 'no match'}`)
    }
  }
  for (const [rel, reason] of EXEMPT) {
    if (!reason || reason.length < 40) failures.push(`  exemption ${rel} has no substantive stated reason`)
  }
  if (failures.length > 0) {
    console.error('guard-no-hand-rolled-jsonc: SELFTEST FAILED\n')
    console.error(failures.join('\n'))
    console.error('\nThe detection signature no longer matches the shapes it claims to catch.')
    process.exit(1)
  }
  console.log(`guard-no-hand-rolled-jsonc: selftest ok (${FIXTURES.length} fixtures, ${EXEMPT.size} exemptions)`)
}

// ── scan ────────────────────────────────────────────────────────────────────
const scan = () => {
  const files = globSync('**/*.{ts,mts,cts,js,mjs,cjs}', { cwd: ROOT })
    .filter((entry) => SCANNED.test(entry) && !IGNORED.test(entry))
    .sort()

  const violations = []
  for (const rel of files) {
    if (EXEMPT.has(rel)) continue
    let source
    try {
      source = readFileSync(path.join(ROOT, rel), 'utf8')
    } catch {
      continue
    }
    const signature = detect(source)
    if (signature) violations.push({ rel, signature, line: lineOf(source, signature) })
  }

  if (violations.length > 0) {
    console.error('guard-no-hand-rolled-jsonc: hand-rolled JSONC parsing\n')
    for (const { rel, signature, line } of violations) {
      console.error(`  ${rel}:${line}  [${signature}]`)
    }
    console.error(
      `\n${violations.length} violation(s). Parse JSONC with \`parse\` from \`@std/jsonc\` — it is string-aware,`,
    )
    console.error('accepts trailing commas, and is already in the workspace catalog. Where the stripping')
    console.error('defends nothing, delete it instead.')
    console.error('\nA regex that strips comments cannot tell a comment from the same bytes inside a string:')
    console.error('  "src/**/*.ts"  ->  "src*.ts"   (silently, and the result still parses)')
    process.exit(1)
  }

  console.log(`guard-no-hand-rolled-jsonc: ${files.length} source file(s) clean`)
}

if (process.argv.includes('--selftest')) selftest()
else scan()

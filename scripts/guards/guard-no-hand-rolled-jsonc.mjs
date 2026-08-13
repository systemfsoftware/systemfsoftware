#!/usr/bin/env node
// Bans hand-rolled JSON-with-comments parsing. Use `parse` from `@std/jsonc`.
//
// THIS IS A TRIPWIRE, NOT A PROOF OF ABSENCE. It keys on four shapes: the three
// this repo has actually produced, plus the numeric-code and windowed-substring
// re-formulations of the scanner shape that an adversarial review demonstrated as
// equally natural evasions. A determined re-implementation (the delimiters split
// across variables or files) still gets through. A green run means "none of the
// four known shapes is present", never "no hand-rolled parser exists".
//
// It exists because per-package lint cannot reach the code that broke:
// `scripts/guards/check-lint-coverage.mjs` classifies every `packages/stryker-js/`
// package as tooling, so the shared cell rule set never runs there and each
// package lints against its own baseline instead. A root script
// scans every file regardless -- and the selftest pins that reach: if the scanned
// set ever stops including `packages/stryker-js/`, the guard has been neutered
// and the selftest fails.
//
// Why four signatures: the two strippers deleted from this repo did NOT share an
// implementation, and a regex-only signature would have missed one of them.
//
//   S1  regex form    checker  -- a comment-stripping regex, written as a literal
//                               or built through `new RegExp` from string content
//   S2  scanner form  core     -- a character walk with zero regexes, string-aware
//                               but dropped the char after every backslash escape;
//                               operands as quoted chars or numeric codes
//                               (0x2F/47, 0x2A/42)
//   S2s window form             -- a two-char window tested against the
//                               comment-open literal with no comparison operators
//                               ("'/*'.includes(t.slice(i, i + 2))" or the
//                               slice-then-compare spelling)
//   S3  name form              -- the obvious re-introduction under either shape
//
// A file trips only when a signature co-occurs with a `JSON.parse` call: that
// pairing -- strip the comments, then hand the result to a parser that rejects
// them -- is the defect. Either half alone is legitimate.

import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

// Pruned by `globSync`'s `exclude` option instead of post-filtered: the walk
// stops at these directories rather than listing their files and dropping them
// afterwards (measured: ~470ms -> ~185ms on the same file set).
const EXCLUDED = [
  '**/node_modules/**',
  '**/dist/**',
  '**/repos/**',
  '**/coverage/**',
  '**/reports/**',
  '**/.stryker-tmp/**',
  '**/.worktrees/**',
  '**/.git/**',
]

// Each exemption states why `@std/jsonc` is not its remedy. An exemption that
// parks a live defect is a silent bypass (CONSTITUTION §V.6), so keep this list
// short and keep the reasons true.
const EXEMPT = new Map([
  [
    'scripts/guards/guard-no-hand-rolled-jsonc.mjs',
    'this file -- it necessarily contains the patterns it bans. Consequence, stated rather than hidden: a stripper added to the guard itself is not caught.',
  ],
  [
    'packages/oxlint-plugins/recommended/scripts/guard-no-behavior.mjs',
    'strips comments from JS source, not JSONC -- `@std/jsonc` is not the remedy. It carries a declared, unparked ordering bug: see the comment at `stripLiterals` in that file.',
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

// S1, constructed form: the same stripper arrived via `new RegExp('/\\*…\\*/')`
// instead of a regex literal. The delimiters are now string content, so the
// escaped form `\/\*` never appears in source -- they show up as `/\\*` (slash,
// doubled backslash, star) or, when the author escaped the slashes, `\\/\\*`.
// Collapsing `\\` -> `\` over the constructor's argument span recovers the regex
// source, where both the `/*`-open and `*\/`-close must be present. Scoped to the
// RegExp constructor so glob strings like "src/**/*.ts" cannot trip it; the
// delimiters split across variables still get through -- that is the declared
// tripwire limit, not a silent gap.
const REGEX_CONSTRUCTED = /(?:new\s+)?RegExp\s*\(([^)]*)\)/
const collapseEscapes = (text) => text.replaceAll('\\\\', '\\')
const isConstructedRegexForm = (text) => {
  const global = new RegExp(REGEX_CONSTRUCTED.source, 'g')
  for (const match of text.matchAll(global)) {
    const args = collapseEscapes(match[1])
    if (args.includes('/\\*') && args.includes('\\*/')) return true
  }
  return false
}
const isRegexForm = (text) =>
  (REGEX_BLOCK.every((d) => text.includes(d))) || REGEX_LINE.test(text) || isConstructedRegexForm(text)

// S2: the comment-open bigram in comparison position -- a character compared
// against `/`, then, WITHIN THE SAME BOOLEAN EXPRESSION, another compared against
// `*` or a second `/`. That adjacency is what a hand-rolled comment scanner looks
// like. The gap forbids `;` and `{` so the two comparisons must belong to one
// expression rather than merely landing near each other.
//
// The operands may be quoted char literals (`'/'`, `'*'`) or numeric character
// codes (47/0x2F for `/`, 42/0x2A for `*`): the same scanner walk, spelled with
// `charCodeAt` instead of indexing. The numeric spellings carry a `\b` so
// `x === 470` cannot match as `47`.
//
// Both constraints were measured, not guessed. Counting slash literals instead
// flagged 4 unrelated path-splitting loops (arethetypeswrong, check-exports.mjs);
// allowing any 48 characters between them flagged two adjacent but independent
// `if` statements. The selftest pins both boundaries as negatives.
const SCANNER_BIGRAM =
  /[=!]==?\s*(?:(['"`])\/\1|0[xX]2[fF]\b|47\b)[^;{]{0,32}?[=!]==?\s*(?:(['"`])[*/]\2|0[xX]2[fFaA]\b|4[72]\b)/

// S2s: the windowed-substring scanner -- a two-char window tested against the
// comment-open literal, with no comparison operators at all. Two spellings: the
// literal as the RECEIVER of a substring test ("'/*'.includes(t.slice(i, i + 2))"),
// and a sliced window compared to the literal ("t.slice(i, i + 2) === '/*'"), which
// also covers a window hoisted into a variable. Two deliberate boundaries, each
// pinned by a negative fixture: the slice-compare matches `/*` ONLY -- `url.slice(0,
// 2) === '//'` is legitimate protocol-relative detection -- and a literal in
// ARGUMENT position ("path.includes('/*')") is legitimate substring testing, so
// only receiver-position literals fire.
const SCANNER_SLICE =
  /(?:(?:slice|substring|substr)\s*\([^;{]{0,40}?)?[=!]==?\s*(['"`])\/\*\1|(['"`])\/\*\2\s*\.\s*(?:includes|startsWith|endsWith)\s*\(|(['"`])\/\/\3\s*\.\s*(?:includes|startsWith|endsWith)\s*\(/

/**
 * Returns the signature that fired, or null. Module-private: nothing imports
 * this file (importing it would run the entry point below as a side effect), and
 * `--selftest` drives `detect` directly within this module, so no export is
 * needed.
 */
const detect = (source) => {
  if (!JSON_PARSE.test(source)) return null
  if (isRegexForm(source)) return 'S1-regex'
  if (SCANNER_BIGRAM.test(source)) return 'S2-scanner'
  if (SCANNER_SLICE.test(source)) return 'S2-slice'
  if (STRIP_NAME.test(source)) return 'S3-name'
  return null
}

// One line per signature, printed when that signature fires. The S2 line also
// states the F4 reporting convention: for a multi-line bigram the reported line
// is the FIRST line of the matched span -- derived from the signature's own
// match, not from a looser per-line re-scan that can land elsewhere.
const SIGNATURES = {
  'S1-regex':
    'a comment-stripping regex -- it cannot tell a comment from the same bytes inside a string ("src/**/*.ts" becomes "src*.ts")',
  'S2-scanner':
    'a hand-rolled character scanner comparing a char against the comment-open bigram, as a literal or a numeric code (line = first line of the matched span)',
  'S2-slice':
    'a windowed-substring check against the comment-open literal ("\'/*\'.includes(t.slice(i, i + 2))" or "t.slice(i, i + 2) === \'/*\'")',
  'S3-name': 'a call to a function named like stripComments / stripJsonComments',
}

// Where in `source` does `signature`'s evidence start? Returns -1 if absent.
const matchIndexOf = (source, signature) => {
  switch (signature) {
    case 'S1-regex': {
      const candidates = [source.indexOf(REGEX_BLOCK[0]), REGEX_LINE.exec(source)?.index ?? -1]
      const global = new RegExp(REGEX_CONSTRUCTED.source, 'g')
      for (const match of source.matchAll(global)) {
        const args = collapseEscapes(match[1])
        if (args.includes('/\\*') && args.includes('\\*/')) {
          candidates.push(match.index)
          break
        }
      }
      const hits = candidates.filter((n) => n >= 0)
      return hits.length === 0 ? -1 : Math.min(...hits)
    }
    case 'S2-scanner':
      return SCANNER_BIGRAM.exec(source)?.index ?? -1
    case 'S2-slice':
      return SCANNER_SLICE.exec(source)?.index ?? -1
    case 'S3-name':
      return STRIP_NAME.exec(source)?.index ?? -1
    default:
      return -1
  }
}

const lineOf = (source, signature) => {
  const index = matchIndexOf(source, signature)
  if (index < 0) return 1
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1
  }
  return line
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
  ['S1-regex', `const s = json.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ''); ${P}`, 'S1: regex pair, the checker shape', 1],
  ['S1-regex', `const s = json.replace(/\\/\\/.*$/gm, ''); ${P}`, 'S1: line-comment regex, the other half of the pair'],
  [
    'S1-regex',
    `const re = new RegExp('/\\\\*[\\\\s\\\\S]*?\\\\*/'); ${P}`,
    'S1: block-comment stripper built through new RegExp from string content -- the canonical unescaped form (F3)',
    1,
  ],
  [
    'S1-regex',
    `const re = new RegExp('/\\\\*' + '[\\\\s\\\\S]*?' + '\\\\*/'); ${P}`,
    'S1: the same constructed stripper assembled from string fragments (F3)',
  ],
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
  [
    'S2-scanner',
    `let i = 0
     while (i < json.length) {
       if (json.charCodeAt(i) === 0x2F && json.charCodeAt(i + 1) === 0x2A) { i += 2; continue }
       out += json[i]; i++
     }
     ${P}`,
    'S2: the same walk with charCodeAt compared against hex codes -- no quote literals anywhere',
  ],
  [
    'S2-scanner',
    `let i = 0
     while (i < json.length) {
       const c1 = json.charCodeAt(i), c2 = json.charCodeAt(i + 1)
       if (c1 === 47 && c2 === 42) { i += 2; continue }
       if (c1 === 47 && c2 === 47) { i += 1; continue }
       out += json[i]; i++
     }
     ${P}`,
    'S2: decimal codes, both the block-open (47,42) and line-open (47,47) bigrams',
  ],
  [
    'S2-slice',
    `let i = 0
     while (i < json.length) {
       if ('/*'.includes(json.slice(i, i + 2))) { i += 2; continue }
       if ('//'.startsWith(json.slice(i, i + 2))) { i += 1; continue }
       out += json[i]; i++
     }
     ${P}`,
    'S2s: windowed substring test against the comment-open literal -- no comparison operators at all',
  ],
  [
    'S2-slice',
    `let i = 0
     while (i < json.length) {
       if (json.slice(i, i + 2) === '/*') { i += 2; continue }
       out += json[i]; i++
     }
     ${P}`,
    'S2s: the reversed spelling -- slice a window, then compare it to the literal',
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
    `// keep this comment: /* and */ in prose\nconst re = new RegExp('\\\\d+'); const n = a / b * c; ${P}`,
    'F3 negative: block-comment markers in prose, innocent division, and a delimiter-free constructed regex',
  ],
  [
    null,
    `const findSourceMapRegex = /\\/\\/# sourceMappingURL=(.+)$/m; ${P}`,
    'sourceMappingURL regex -- escapes a double slash but matches a specific token, not a comment',
  ],
  [
    null,
    `if (len === 47) done(); if (size === 42) fail(); ${P}`,
    '47 and 42 compared, but in separate statements -- the ; gap guard must hold for codes too',
  ],
  [
    null,
    `if (c > 47 && c < 58) return digit; ${P}`,
    'relational range check around 47 -- no equality operator, no bigram',
  ],
  [
    null,
    `if (url.slice(0, 2) === '//') return protoRelative; ${P}`,
    'protocol-relative URL check -- slice-compared against //, legitimately, so the slice signature matches the /* literal only',
  ],
  [
    null,
    `if (path.includes('/*')) return glob; ${P}`,
    'comment-open literal in ARGUMENT position -- path.includes is legitimate substring testing; only receiver-position literals fire',
  ],

  // F4: the reported line must come from the signature's own match, not from a
  // looser per-line re-scan. This fixture puts a standalone slash compare on an
  // EARLIER line than the real bigram, which the old per-line probe latched onto.
  [
    'S2-scanner',
    `if (x === '/') { return }            // standalone slash compare, not part of the bigram
     if (json[i] === '/' &&
         json[i + 1] === '*') { i += 2 }
     ${P}`,
    'S2: lineOf must report the line where the BIGRAM starts, not the first loose slash compare (F4)',
    2,
  ],
]

// The scan's reach is load-bearing: this guard exists ONLY because per-package
// lint cannot see `packages/stryker-js/`, so a future EXCLUDED entry or narrower
// glob that drops that fork silently neuters the guard with every fixture still
// green. Pin the prefix, not a count -- the fork's file set legitimately changes,
// but the directory must stay in scope.
const assertReachesStryker = () => {
  const files = scanFiles()
  const stryker = files.filter((rel) => rel.startsWith('packages/stryker-js/'))
  if (stryker.length === 0) {
    console.error(
      'guard-no-hand-rolled-jsonc: SELFTEST FAILED\n\n' +
        '  the scan does not reach packages/stryker-js/ -- per-package lint is exempted\n' +
        '  there, so a guard that skips it scans nothing worth guarding. Check EXCLUDED\n' +
        '  and the glob pattern.',
    )
    process.exit(1)
  }
  return stryker.length
}

const selftest = () => {
  const failures = []
  const strykerFiles = assertReachesStryker()
  for (const [expected, source, label, expectedLine] of FIXTURES) {
    const actual = detect(source)
    if (actual !== expected) {
      failures.push(`  ${label}\n    expected ${expected ?? 'no match'}, got ${actual ?? 'no match'}`)
      continue
    }
    if (expectedLine !== undefined) {
      const actualLine = lineOf(source, expected)
      if (actualLine !== expectedLine) {
        failures.push(`  ${label}\n    expected line ${expectedLine}, got ${actualLine}`)
      }
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
  console.log(
    `guard-no-hand-rolled-jsonc: selftest ok (${FIXTURES.length} fixtures, ${EXEMPT.size} exemptions; scan reaches ${strykerFiles} files under packages/stryker-js/)`,
  )
}

// ── scan ────────────────────────────────────────────────────────────────────
// The glob pattern already guarantees the scanned extensions, and `exclude`
// prunes the ignored directories during traversal, so no post-filter remains.
const scanFiles = () => globSync('**/*.{ts,mts,cts,js,mjs,cjs}', { cwd: ROOT, exclude: EXCLUDED }).sort()

const scan = () => {
  const files = scanFiles()

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
      console.error(`  ${rel}:${line}  [${signature}] ${SIGNATURES[signature]}`)
    }
    console.error(
      `\n${violations.length} violation(s). Parse JSONC with \`parse\` from \`@std/jsonc\` — it is string-aware,`,
    )
    console.error('accepts trailing commas, and is already in the workspace catalog. Where the stripping')
    console.error('defends nothing, delete it instead.')
    process.exit(1)
  }

  console.log(`guard-no-hand-rolled-jsonc: ${files.length} source file(s) clean`)
}

// Entry point. This file is a script, not a library: importing it runs one of
// these branches as an import side effect -- deliberate, since nothing should
// import a tripwire that scans the whole repo.
if (process.argv.includes('--selftest')) selftest()
else scan()

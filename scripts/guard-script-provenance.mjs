#!/usr/bin/env node
// LOCKED SURFACE -- evaluation script (AGENTS.md Surface Classes).
// Never add an entry below to make a new script pass. If no category fits, that
// IS the verdict: the rule belongs in a published artifact, not here.
//
// Answers two questions about `scripts/`, and nothing else.
//
//   Arm 1 -- does any file here READ a doctrine artifact?
//     `CONSTITUTION.md`, `CONCEPTS.md`, `AGENTS.md`, `CLAUDE.md`, `wiki/`,
//     `docs/solutions/`, `.claude/`. Doctrine is context engineering: it changes
//     what an agent does by being read BY THE AGENT. A gate that parses it
//     promotes prose to a spec, and the prose was never written to be one -- so
//     the gate ends up asserting a claim nobody maintains, which is the vacuous
//     green check REPO-S6 exists to prevent.
//
//   Arm 2 -- is the directory a closed set?
//     Every entry is enumerated below with the repo-local category that admits
//     it. A new file with no entry fails. The failure forces its author to name
//     a category -- or to discover that none fits, which is REPO-S6's answer.
//
// Why this file is LOCKED: the manifest is the rubric. An agent free to edit it
// would add a script and its own permission in one commit, and the gate would
// never fire. Adding a script is deliberately a two-commit act.
//
// Declared limits, stated rather than hidden:
//
//   - Arm 1 parses with `oxc-parser` (the parser oxlint itself uses) rather than
//     stripping comments by hand, which `guard-no-hand-rolled-jsonc.mjs` bans.
//     A doctrine path in a comment therefore passes -- three files cite
//     `AGENTS.md` or `CONSTITUTION` in prose today and must keep passing. So
//     does a diagnostic: `guard-mutate-scope.mjs` ends with
//     `console.error('See AGENTS.md REPO-S5.')`, a pointer, not a read.
//   - Arm 1 fails CLOSED on everything else. Any doctrine path in a string that
//     is not inside a `console.*` call, an `Error` construction, or a `throw` is
//     reported. A path assembled from fragments or held in a variable is not
//     caught; a green Arm 1 means "no direct doctrine path in code", never "no
//     script reads doctrine".
//   - `.sh` files cannot be parsed by `oxc-parser`. They are checked line-wise
//     with `#` comment lines dropped. Shell has no block comments, so this is
//     exact for shell, and is not a second comment-stripper implementation.
//   - Arm 2 checks that a category and a reason are PRESENT and that the
//     category is one of four. It does NOT check that the reason is true. The
//     reason is prose a human reads in the diff; presence is the whole machine
//     claim.
//   - `local-tooling` extends REPO-S6's three named categories (workspace
//     layout, release metadata, vendored trees). Stated here rather than
//     smuggled: REPO-S6 governs ENFORCEMENT channels, and a developer
//     convenience wired into no chain enforces nothing.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseSync } from 'oxc-parser'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const DOCTRINE = [
  'CONSTITUTION.md',
  'CONCEPTS.md',
  'AGENTS.md',
  'CLAUDE.md',
  'wiki/',
  'docs/solutions',
  '.claude/',
]

const CATEGORIES = new Set([
  'workspace-layout',
  'release-metadata',
  'vendored-trees',
  'local-tooling',
])

// name -> [category, why this concern cannot reach a consumer through a package]
const MANIFEST = new Map([
  ['bench-mutation.mjs', [
    'local-tooling',
    'Developer benchmark for mutation wall-clock. Wired into no chain; enforces nothing.',
  ]],
  ['bump-all-minor.mjs', [
    'release-metadata',
    'Rewrites every package version. Release metadata this repository owns.',
  ]],
  ['check-exports.mjs', [
    'release-metadata',
    'Asserts package.json exports match tsdown output (REPO-S4). Manifest metadata, not code.',
  ]],
  ['check-lint-coverage.mjs', [
    'workspace-layout',
    'DEFINES production vs tooling packages and asserts each opts into oxlint. No package can see the workspace.',
  ]],
  ['check-npm-publish.sh', [
    'release-metadata',
    'Registry state per workspace package: unpublished, and OIDC readiness.',
  ]],
  ['check-project-references.mjs', [
    'workspace-layout',
    'The tsconfig project graph spans packages; no single package can see it.',
  ]],
  ['check-runtime-deps.mjs', [
    'release-metadata',
    'Compares built dist imports against each declared dependency set.',
  ]],
  ['guard-mutate-scope.mjs', [
    'workspace-layout',
    'REPO-S5 mutate globs across every package. The rule is about repo cell layout.',
  ]],
  ['guard-no-hand-rolled-jsonc.mjs', [
    'workspace-layout',
    'Per-package lint cannot reach packages/stryker-js: vendored fork, no lint script. See its own header.',
  ]],
  ['guard-script-provenance.mjs', [
    'workspace-layout',
    'This file. The set it polices IS the workspace arrangement of scripts/.',
  ]],
  ['merge-mutation-reports.mjs', [
    'workspace-layout',
    'Aggregates one mutation report per package from a CI matrix run into a single report. Spans every package; no package can see the workspace.',
  ]],
  ['patch-tsgo-if-needed.mjs', [
    'workspace-layout',
    'Guards the shared native tsc all 41 packages typecheck through against a non-idempotent devDependency install hook. No package can see another package node_modules.',
  ]],
  ['rolldown-eager-entry-budget.mjs', [
    'local-tooling',
    'Bundle eager-entry probe. NO CALLERS as of 2026-08-06; a deletion candidate, not a gate.',
  ]],
  ['validate-publish-config.mjs', [
    'release-metadata',
    'repository.url and repository.directory per publishable manifest; npm rejects a mismatch with 422 after the tag lands.',
  ]],
  ['check-changeset.mjs', [
    'release-metadata',
    'The changeset gate for publishable-package PRs; invoked by changeset-check.yml, never a package dependency.',
  ]],
  ['tag-released-packages.mjs', [
    'release-metadata',
    'Idempotently tags name@v<version> for released packages; invoked by release.yml after publish, never a package dependency.',
  ]],
  ['worktrunk', [
    'local-tooling',
    'Worktrunk git-worktree lifecycle hooks, invoked by .config/wt.toml. Operator workflow.',
  ]],
])

const lineOf = (source, offset) => {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1
  }
  return line
}

const matchDoctrine = (text) => DOCTRINE.filter((token) => text.includes(token))

/** A console.* call, an Error construction, or a throw -- a pointer, never a read. */
const isDiagnostic = (node) => {
  if (node.type === 'ThrowStatement') return true
  if (node.type === 'NewExpression' || node.type === 'CallExpression') {
    const callee = node.callee
    if (callee?.type === 'Identifier' && callee.name.endsWith('Error')) return true
    if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier') {
      return callee.object.name === 'console'
    }
  }
  return false
}

/**
 * Every doctrine path in a string literal that is not inside a diagnostic.
 * Fails closed: an unrecognised call shape reports rather than passes.
 */
const findDoctrineReads = (filename, source) => {
  const { errors, program } = parseSync(filename, source)
  if (errors.length > 0) {
    return [{ line: 0, parseError: errors[0].message ?? String(errors[0]), tokens: [] }]
  }

  const found = []
  const walk = (node, inDiagnostic) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, inDiagnostic)
      return
    }

    const diagnostic = inDiagnostic || isDiagnostic(node)

    if (!diagnostic && node.type === 'Literal' && typeof node.value === 'string') {
      const tokens = matchDoctrine(node.value)
      if (tokens.length > 0) found.push({ line: lineOf(source, node.start ?? 0), tokens })
    }
    if (!diagnostic && node.type === 'TemplateElement') {
      const tokens = matchDoctrine(node.value?.cooked ?? node.value?.raw ?? '')
      if (tokens.length > 0) found.push({ line: lineOf(source, node.start ?? 0), tokens })
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'range') continue
      walk(node[key], diagnostic)
    }
  }

  walk(program, false)
  return found
}

/** Shell has line comments only, so dropping `#` lines is exact rather than a parser. */
const findDoctrineReadsShell = (source) =>
  source
    .split('\n')
    .map((text, index) => [index + 1, text])
    .filter(([, text]) => !text.trimStart().startsWith('#'))
    .map(([line, text]) => ({ line, tokens: matchDoctrine(text) }))
    .filter(({ tokens }) => tokens.length > 0)

const checkClosedSet = (present, manifest) => ({
  stale: [...manifest.keys()].filter((name) => !present.includes(name)),
  unlisted: present.filter((name) => !manifest.has(name)),
})

const checkCategories = (manifest) =>
  [...manifest.entries()]
    .filter(([, [category, reason]]) => !CATEGORIES.has(category) || (reason ?? '').trim().length === 0)
    .map(([name, [category]]) => `${name}: category ${JSON.stringify(category)}`)

const PARSEABLE = /\.(?:mjs|cjs|js|mts|cts|ts)$/

const collectFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? collectFiles(full) : [full]
  })

const scan = (root) => {
  const scriptsDir = join(root, 'scripts')
  const present = readdirSync(scriptsDir).sort()
  const { stale, unlisted } = checkClosedSet(present, MANIFEST)
  const badCategories = checkCategories(MANIFEST)

  const reads = []
  for (const file of collectFiles(scriptsDir)) {
    const rel = relative(root, file)
    if (rel.endsWith('guard-script-provenance.mjs')) continue // own DOCTRINE table
    const source = readFileSync(file, 'utf8')
    const hits = PARSEABLE.test(file)
      ? findDoctrineReads(file, source)
      : file.endsWith('.sh')
      ? findDoctrineReadsShell(source)
      : []
    for (const hit of hits) reads.push({ file: rel, ...hit })
  }

  return { badCategories, filesScanned: present.length, reads, stale, unlisted }
}

const FIXTURES = [
  ['a bare doctrine read is reported', "readFileSync('CONSTITUTION.md', 'utf8')", 1],
  ['a joined doctrine path is reported', "readFileSync(join(root, 'wiki/log.md'))", 1],
  ['a template doctrine path is reported', 'readFileSync(`${root}/CONCEPTS.md`)', 1],
  ['an operator-config read is reported', "readFileSync('.claude/CLAUDE.md')", 1],
  ['a comment citation passes', '// See AGENTS.md REPO-S5 for the rule.\nconst x = 1', 0],
  ['a console pointer passes', "console.error('See AGENTS.md REPO-S5.')", 0],
  ['a thrown pointer passes', "throw new Error('CONSTITUTION.md V.6 forbids this')", 0],
  ['an unrelated read passes', "readFileSync('package.json', 'utf8')", 0],
]

const selftest = () => {
  const failures = []

  for (const [label, source, expected] of FIXTURES) {
    const actual = findDoctrineReads('fixture.mjs', source).length
    if (actual !== expected) failures.push(`  ${label}: expected ${expected} report(s), got ${actual}`)
  }

  const shellReported = findDoctrineReadsShell('# cat CONSTITUTION.md\ncat wiki/log.md\n')
  if (shellReported.length !== 1 || shellReported[0].line !== 2) {
    failures.push(`  shell: expected one report on line 2, got ${JSON.stringify(shellReported)}`)
  }

  const closed = checkClosedSet(
    ['a.mjs', 'b.mjs'],
    new Map([['a.mjs', ['local-tooling', 'x']], ['c.mjs', ['local-tooling', 'x']]]),
  )
  if (closed.unlisted.join() !== 'b.mjs') {
    failures.push(`  closed-set: expected b.mjs unlisted, got ${closed.unlisted.join()}`)
  }
  if (closed.stale.join() !== 'c.mjs') failures.push(`  closed-set: expected c.mjs stale, got ${closed.stale.join()}`)

  const bad = checkCategories(new Map([['x.mjs', ['invented-category', 'r']], ['y.mjs', ['local-tooling', '  ']]]))
  if (bad.length !== 2) {
    failures.push(`  categories: expected 2 rejections, got ${bad.length} -> ${JSON.stringify(bad)}`)
  }

  // The real directory must be reachable, or a green run proves nothing was looked at.
  const live = scan(repoRoot)
  if (live.filesScanned < 10) failures.push(`  reach: scanned only ${live.filesScanned} entries in scripts/`)

  if (failures.length > 0) {
    console.error('guard-script-provenance: selftest FAILED\n')
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log(`guard-script-provenance: selftest ok (${FIXTURES.length + 5} fixtures)`)
}

const run = () => {
  const { badCategories, filesScanned, reads, stale, unlisted } = scan(repoRoot)
  let failed = false

  if (reads.length > 0) {
    failed = true
    console.error(`guard-script-provenance: ${reads.length} doctrine read(s) under scripts/\n`)
    for (const hit of reads) {
      const detail = hit.parseError ? `parse error: ${hit.parseError}` : hit.tokens.join(', ')
      console.error(`  ${hit.file}:${hit.line}: ${detail}`)
    }
    console.error(
      `\nDoctrine is context engineering: CONSTITUTION.md, CONCEPTS.md, AGENTS.md, CLAUDE.md,\n` +
        `wiki/, docs/solutions/ and .claude/ change what an agent does by being read by the\n` +
        `agent. A gate that parses them promotes prose to a spec nobody maintains, and the\n` +
        `check goes green while proving nothing (REPO-S6). Put the rule in a published oxlint\n` +
        `plugin or a published type signature. Citing a doctrine path in a comment, a\n` +
        `console.* call, or a thrown Error is fine -- that is a pointer, not a read.`,
    )
  }

  if (unlisted.length > 0) {
    failed = true
    console.error(`\nguard-script-provenance: ${unlisted.length} entr(y/ies) in scripts/ with no manifest entry\n`)
    for (const name of unlisted) console.error(`  ${name}`)
    console.error(
      `\nscripts/ is a closed set. Add an entry to MANIFEST in this file naming one of:\n` +
        `  ${[...CATEGORIES].join(', ')}\n` +
        `plus one line stating why the concern cannot reach a consumer through a package.\n` +
        `If no category fits, REPO-S6 has already answered: the rule belongs in a published\n` +
        `artifact, and this file is not it. This file is LOCKED, so the entry is its own commit.`,
    )
  }

  if (stale.length > 0) {
    failed = true
    console.error(
      `\nguard-script-provenance: ${stale.length} manifest entr(y/ies) naming a file that no longer exists\n`,
    )
    for (const name of stale) console.error(`  ${name}`)
    console.error('\nDelete the entry. A manifest that names absent files is the drift this gate exists to stop.')
  }

  if (badCategories.length > 0) {
    failed = true
    console.error(
      `\nguard-script-provenance: ${badCategories.length} manifest entr(y/ies) with an unknown category or empty reason\n`,
    )
    for (const detail of badCategories) console.error(`  ${detail}`)
    console.error(`\nPermitted categories: ${[...CATEGORIES].join(', ')}`)
  }

  if (failed) process.exit(1)
  console.log(`guard-script-provenance: ${filesScanned} entr(y/ies) in scripts/ declared, no doctrine reads`)
}

// Entry point. Runs only when executed directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) selftest()
  else run()
}

export { checkCategories, checkClosedSet, findDoctrineReads, findDoctrineReadsShell, scan }

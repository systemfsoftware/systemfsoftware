#!/usr/bin/env node
/**
 * Dist-integrity check: verify node builtin imports in a built dist
 * match what the source expects (KTD5).
 * Usage:
 *   node omp/scripts/check-dist-builtins.mjs --dist dist/index.js --expect child_process fs path
 *   node omp/scripts/check-dist-builtins.mjs --dist dist/index.js --expect                        # expects none
 *
 * Builtin names in --expect accept both bare (fs) and node:-prefixed (node:fs)
 * forms; the check normalizes both sides to bare names before comparing.
 *
 * Exits 1 with a clear message on mismatch.
 */

import { existsSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)

let distPath = null
const expected = []

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dist') {
    distPath = args[++i]
  } else if (args[i] === '--expect') {
    // Collect following args until the next flag as expected builtins
    while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
      expected.push(args[++i])
    }
  }
}

if (!distPath) {
  console.error('Usage: check-dist-builtins.mjs --dist <path> --expect [builtin...]')
  process.exit(1)
}

if (!existsSync(distPath)) {
  console.error(`Dist not found: ${distPath}`)
  process.exit(1)
}

const code = readFileSync(distPath, 'utf-8')

// Extract node builtin imports from the dist — handles ESM (from/import/import()) and CJS (require)
const builtinRe =
  /(?:from\s+['"]node:([^'"]+)['"]|import\(['"]node:([^'"]+)['"]\)|import\s+['"]node:([^'"]+)['"]|require\(['"]node:([^'"]+)['"]\))/g
const found = new Set()
let match
while ((match = builtinRe.exec(code)) !== null) {
  // Match captures: group 1 (from), 2 (dynamic import), 3 (side-effect import), 4 (require)
  found.add(match[1] ?? match[2] ?? match[3] ?? match[4])
}
// Normalize both sides to bare node builtin names (strip any node: prefix)
const normalize = (name) => name.replace(/^node:/, '')
const expectedSet = new Set(expected.map(normalize))
const actualSet = new Set([...found].map(normalize))

const missing = [...expectedSet].filter(e => !actualSet.has(e))
const unexpected = [...actualSet].filter(a => !expectedSet.has(a))

let ok = true

if (missing.length > 0) {
  console.error(`ERROR: Expected node builtins MISSING from dist: ${missing.join(', ')}`)
  ok = false
}

if (unexpected.length > 0) {
  console.error(`ERROR: Unexpected node builtins FOUND in dist: ${unexpected.join(', ')}`)
  ok = false
}

if (ok) {
  if (expected.length > 0) {
    console.log(`✓ Dist builtins check PASSED: all ${expected.length} expected node builtins present`)
  } else {
    const count = found.size
    if (count === 0) {
      console.log('✓ Dist builtins check PASSED: no node builtins in dist (none expected)')
    } else {
      console.error(`ERROR: Dist has ${count} unexpected node builtin(s): ${[...found].join(', ')}`)
      process.exit(1)
    }
  }
} else {
  console.error(`Dist: ${distPath}`)
  console.error(`  Expected: ${expected.length > 0 ? expected.join(', ') : '(none)'}`)
  console.error(`  Found:    ${found.size > 0 ? [...found].join(', ') : '(none)'}`)
  process.exit(1)
}

#!/usr/bin/env node
// LOCKED SURFACE — evaluation script (AGENTS.md Surface Classes).
// Never edit this file to make a mutation config pass; fix the config.
//
// The mutation gate answers exactly one question: "do the tests notice a changed
// DECISION?" That makes it the observer for one cell only.
//
//   *.workflow.ts  pure - behavior - domain     -> mutation IS its observer
//   *.schema.ts    declaration + generated laws -> PERMITTED, never required
//   every other cell                            -> a DIFFERENT observer:
//     executor/handler/middleware/state/store/adapter (shell cells)
//       -> lint provenance rules + composition tests. A shell cell decides
//          nothing, so every mutant is equivalent or is killed by a composition
//          test that was proving something else.
//     kernel (pure, domain-blind)
//       -> colocated K-law property tests (identity, associativity, inverse).
//
// Enrolling a non-workflow cell in a mutate glob is a wrong-observer error.

import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const FORBIDDEN = [
  'executor',
  'kernel',
  'acl',
  'store',
  'handler',
  'middleware',
  'state',
  'adapter',
  'policy',
  'shape',
  'observer',
]

const SUFFIX_RE = new RegExp(`\\.(${FORBIDDEN.join('|')})\\.ts$`)
const IGNORED = /(^|\/)(node_modules|dist|reports|coverage|repos|\.worktrees|\.git)(\/|$)/

const configs = globSync('**/stryker.config.json', { cwd: ROOT })
  .filter((entry) => !IGNORED.test(entry))
  .sort()

const violations = []
const seen = new Set()

const record = (config, subject, reason) => {
  const key = `${config}::${subject}`
  if (seen.has(key)) return
  seen.add(key)
  violations.push({ config, subject, reason })
}

for (const rel of configs) {
  let config
  try {
    config = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'))
  } catch (error) {
    record(rel, rel, `unparseable: ${error.message}`)
    continue
  }

  const mutate = config.mutate
  if (!Array.isArray(mutate) || mutate.length === 0) {
    record(
      rel,
      '(no "mutate" key)',
      'mutate must be an explicit list — the Stryker default sweeps every source file and silently auto-enrolls each new cell',
    )
    continue
  }

  const positives = mutate.filter((pattern) => !pattern.startsWith('!'))
  const negatives = mutate.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))

  for (const pattern of positives) {
    if (FORBIDDEN.some((suffix) => pattern.includes(`.${suffix}.`))) {
      record(rel, pattern, 'the pattern itself names a forbidden cell suffix')
    }
  }

  const cwd = path.join(ROOT, path.dirname(rel))
  const selected = new Set(positives.flatMap((pattern) => globSync(pattern, { cwd })))
  for (const pattern of negatives) {
    for (const file of globSync(pattern, { cwd })) selected.delete(file)
  }

  for (const file of [...selected].sort()) {
    const match = SUFFIX_RE.exec(file)
    if (match) record(rel, file, `${match[1]} cell — mutation is not its observer`)
  }
}

if (violations.length > 0) {
  console.error('guard-mutate-scope: forbidden cells in the mutation surface\n')
  for (const violation of violations) {
    console.error(`  ${violation.config}`)
    console.error(`    ${violation.subject}`)
    console.error(`    ${violation.reason}\n`)
  }
  console.error(
    `${violations.length} violation(s). Mutation observes *.workflow.ts; *.schema.ts is permitted, never required.`,
  )
  console.error('Shell cells are gated by lint provenance + composition tests; kernels by K-law property tests.')
  console.error('See AGENTS.md REPO-S5.')
  process.exit(1)
}

console.log(
  `guard-mutate-scope: ${configs.length} stryker config(s) clean — no forbidden cell in any mutation surface`,
)

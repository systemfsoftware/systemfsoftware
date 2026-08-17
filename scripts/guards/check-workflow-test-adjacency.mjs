#!/usr/bin/env node
//
// Answers one question: does every `src/**/<stem>.workflow.ts` have an adjacent
// `src/**/__tests__/<stem>.workflow.property.test.ts`? A lint rule cannot answer it — a rule
// sees one file at a time and must not stat the disk (OX-TS2) — so the cross-file fact lives
// here.
//
// `git ls-files` supplies CANDIDATES only. Every verdict is recomputed by stat-ing the
// working tree, because the index is a value this script's own caller supplies: a property
// test deleted from disk but still staged would otherwise pass, and the gate would certify
// the absence it exists to catch. Measured 2026-08-17 — the index-keyed version returned
// green with a property test removed from the tree.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const WORKFLOW_BASENAME = /^[^.]+\.workflow\.ts$/
const WORKFLOW_SUFFIX = '.workflow.ts'

// The rule packages are excluded from the workflow conventions (user instruction);
// vendored trees are read-only (REPO-S3).
const EXCLUDED_PREFIXES = ['packages/oxlint-plugins/', 'repos/']

const isExcluded = (path) => EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))

const workflowFilesOf = (paths) => {
  const out = []
  for (const path of paths) {
    if (isExcluded(path)) continue
    const segments = path.split('/')
    const basename = segments[segments.length - 1]
    if (!WORKFLOW_BASENAME.test(basename)) continue
    if (!segments.includes('src')) continue
    out.push(path)
  }
  return out
}

const testPathOf = (workflowPath) => {
  const segments = workflowPath.split('/')
  const basename = segments[segments.length - 1]
  const stem = basename.slice(0, -WORKFLOW_SUFFIX.length)
  const dir = segments.slice(0, -1).join('/')
  return `${dir}/__tests__/${stem}.workflow.property.test.ts`
}

/**
 * `exists` is the only oracle: a candidate absent from the tree imposes no obligation, and a
 * present one demands a test file that is also present. Injected so the selftest can state
 * an index/disk disagreement without touching the repository.
 */
const missingPairs = (candidates, exists) => {
  const missing = []
  for (const workflowPath of workflowFilesOf(candidates)) {
    if (!exists(workflowPath)) continue
    const testPath = testPathOf(workflowPath)
    if (!exists(testPath)) missing.push({ workflowPath, testPath })
  }
  return missing
}

const presentWorkflowFiles = (candidates, exists) => workflowFilesOf(candidates).filter(exists)

const selftest = () => {
  const fixtures = [
    {
      name: 'adjacent test present',
      candidates: ['packages/x/src/decide.workflow.ts', 'packages/x/src/__tests__/decide.workflow.property.test.ts'],
      onDisk: ['packages/x/src/decide.workflow.ts', 'packages/x/src/__tests__/decide.workflow.property.test.ts'],
      expectMissing: false,
    },
    {
      name: 'adjacent test absent everywhere',
      candidates: ['packages/x/src/decide.workflow.ts'],
      onDisk: ['packages/x/src/decide.workflow.ts'],
      expectMissing: true,
    },
    {
      // The defect this gate had: staged but deleted from the tree must still fail.
      name: 'adjacent test staged but removed from the working tree',
      candidates: ['packages/x/src/decide.workflow.ts', 'packages/x/src/__tests__/decide.workflow.property.test.ts'],
      onDisk: ['packages/x/src/decide.workflow.ts'],
      expectMissing: true,
    },
    {
      // A workflow file staged for deletion imposes nothing.
      name: 'workflow removed from the working tree',
      candidates: ['packages/x/src/decide.workflow.ts'],
      onDisk: [],
      expectMissing: false,
    },
    {
      name: 'multi-segment stem is not a workflow cell',
      candidates: ['packages/x/src/foo.bar.workflow.ts'],
      onDisk: ['packages/x/src/foo.bar.workflow.ts'],
      expectMissing: false,
    },
    {
      name: 'rule packages are excluded',
      candidates: ['packages/oxlint-plugins/effect-workflow/src/rules/x.workflow.ts'],
      onDisk: ['packages/oxlint-plugins/effect-workflow/src/rules/x.workflow.ts'],
      expectMissing: false,
    },
    {
      name: 'fixtures outside src impose nothing',
      candidates: ['packages/x/tests/__fixtures__/f.workflow.ts'],
      onDisk: ['packages/x/tests/__fixtures__/f.workflow.ts'],
      expectMissing: false,
    },
  ]
  for (const fixture of fixtures) {
    const onDisk = new Set(fixture.onDisk)
    const isMissing = missingPairs(fixture.candidates, (path) => onDisk.has(path)).length > 0
    if (isMissing !== fixture.expectMissing) {
      console.error(`check-workflow-test-adjacency: selftest failed for "${fixture.name}"`)
      process.exit(1)
    }
  }
  console.log(`check-workflow-test-adjacency: selftest passed (${fixtures.length} cases)`)
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const candidates = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .filter(Boolean)

const onDisk = (path) => existsSync(join(root, path))

const missing = missingPairs(candidates, onDisk)
if (missing.length > 0) {
  for (const { workflowPath, testPath } of missing) {
    console.error(`check-workflow-test-adjacency: ${workflowPath} has no adjacent ${testPath}`)
  }
  process.exit(1)
}
console.log(
  `check-workflow-test-adjacency: ${
    presentWorkflowFiles(candidates, onDisk).length
  } workflow file(s) each have an adjacent property test`,
)

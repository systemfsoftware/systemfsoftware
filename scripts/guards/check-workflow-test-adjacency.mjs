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

const PROPERTY_TEST_BASENAME = /^[^.]+\.workflow\.property\.test\.ts$/
const PROPERTY_TEST_SUFFIX = '.workflow.property.test.ts'

/**
 * The other direction. `src-property-test-cell` sanctions
 * `src/**​/__tests__/<stem>.workflow.property.test.ts` on the stated ground that it sits
 * beside the `<stem>.workflow.ts` that owns it — but a rule sees one file and cannot check
 * that the owner exists, so until now nothing did. An orphan passed: rename or delete the
 * workflow and its property test kept certifying a decision no longer in the tree, under a
 * name that still claimed adjacency. A message may not outrun its predicate (REPO-A4), so
 * either the guard decides this or the rule stops saying it.
 */
const propertyTestFilesOf = (paths) => {
  const out = []
  for (const path of paths) {
    if (isExcluded(path)) continue
    const segments = path.split('/')
    const basename = segments[segments.length - 1]
    if (!PROPERTY_TEST_BASENAME.test(basename)) continue
    if (!segments.includes('src')) continue
    if (segments[segments.length - 2] !== '__tests__') continue
    out.push(path)
  }
  return out
}

const workflowPathOf = (testPath) => {
  const segments = testPath.split('/')
  const basename = segments[segments.length - 1]
  const stem = basename.slice(0, -PROPERTY_TEST_SUFFIX.length)
  const dir = segments.slice(0, -2).join('/')
  return `${dir}/${stem}.workflow.ts`
}

const orphanTests = (candidates, exists) => {
  const orphans = []
  for (const testPath of propertyTestFilesOf(candidates)) {
    if (!exists(testPath)) continue
    const workflowPath = workflowPathOf(testPath)
    if (!exists(workflowPath)) orphans.push({ testPath, workflowPath })
  }
  return orphans
}

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
    {
      name: 'orphan property test whose workflow was deleted',
      candidates: ['packages/x/src/__tests__/decide.workflow.property.test.ts'],
      onDisk: ['packages/x/src/__tests__/decide.workflow.property.test.ts'],
      expectMissing: false,
      expectOrphan: true,
    },
    {
      name: 'orphan property test staged for deletion imposes nothing',
      candidates: ['packages/x/src/__tests__/decide.workflow.property.test.ts'],
      onDisk: [],
      expectMissing: false,
      expectOrphan: false,
    },
    {
      name: 'property test beside its workflow is paired in both directions',
      candidates: ['packages/x/src/decide.workflow.ts', 'packages/x/src/__tests__/decide.workflow.property.test.ts'],
      onDisk: ['packages/x/src/decide.workflow.ts', 'packages/x/src/__tests__/decide.workflow.property.test.ts'],
      expectMissing: false,
      expectOrphan: false,
    },
    {
      name: 'a property test outside __tests__ is not this pairing',
      candidates: ['packages/x/src/decide.workflow.property.test.ts'],
      onDisk: ['packages/x/src/decide.workflow.property.test.ts'],
      expectMissing: false,
      expectOrphan: false,
    },
  ]
  for (const fixture of fixtures) {
    const onDisk = new Set(fixture.onDisk)
    const exists = (path) => onDisk.has(path)
    const isMissing = missingPairs(fixture.candidates, exists).length > 0
    const isOrphan = orphanTests(fixture.candidates, exists).length > 0
    if (isMissing !== fixture.expectMissing || isOrphan !== (fixture.expectOrphan ?? false)) {
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
const orphans = orphanTests(candidates, onDisk)
if (missing.length > 0 || orphans.length > 0) {
  for (const { workflowPath, testPath } of missing) {
    console.error(`check-workflow-test-adjacency: ${workflowPath} has no adjacent ${testPath}`)
  }
  for (const { testPath, workflowPath } of orphans) {
    console.error(
      `check-workflow-test-adjacency: ${testPath} names a workflow cell that does not exist — expected ${workflowPath}`,
    )
  }
  process.exit(1)
}
console.log(
  `check-workflow-test-adjacency: ${
    presentWorkflowFiles(candidates, onDisk).length
  } workflow file(s) each have an adjacent property test, and every adjacent property test names one`,
)

#!/usr/bin/env node
// LOCKED SURFACE (AGENTS.md Surface Classes).
// Never edit this file to make an adjacency failure pass; add the missing test instead.
//
// Answers one question: does every tracked `src/**/<stem>.workflow.ts` have an
// adjacent `src/**/__tests__/<stem>.workflow.property.test.ts`? A lint rule cannot
// answer it — a rule sees one file at a time and must not stat the disk (OX-TS2) —
// so the cross-file fact lives here, recomputed from `git ls-files` on every run.

import { execFileSync } from 'node:child_process'

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

const missingPairs = (tracked) => {
  const trackedSet = new Set(tracked)
  const missing = []
  for (const workflowPath of workflowFilesOf(tracked)) {
    const testPath = testPathOf(workflowPath)
    if (!trackedSet.has(testPath)) missing.push({ workflowPath, testPath })
  }
  return missing
}

const selftest = () => {
  const fixtures = [
    {
      workflow: 'packages/x/src/decide.workflow.ts',
      test: 'packages/x/src/__tests__/decide.workflow.property.test.ts',
      expectMissing: false,
    },
    { workflow: 'packages/x/src/decide.workflow.ts', test: null, expectMissing: true },
    { workflow: 'packages/x/src/foo.bar.workflow.ts', test: null, expectMissing: false },
    { workflow: 'packages/oxlint-plugins/effect-workflow/src/rules/x.workflow.ts', test: null, expectMissing: false },
    { workflow: 'packages/x/tests/__fixtures__/f.workflow.ts', test: null, expectMissing: false },
  ]
  for (const fixture of fixtures) {
    const tracked = [fixture.workflow, ...(fixture.test ? [fixture.test] : [])]
    const isMissing = missingPairs(tracked).length > 0
    if (isMissing !== fixture.expectMissing) {
      console.error(`check-workflow-test-adjacency: selftest failed for ${fixture.workflow}`)
      process.exit(1)
    }
  }
  console.log('check-workflow-test-adjacency: selftest passed')
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .filter(Boolean)

const missing = missingPairs(tracked)
if (missing.length > 0) {
  for (const { workflowPath, testPath } of missing) {
    console.error(`check-workflow-test-adjacency: ${workflowPath} has no adjacent ${testPath}`)
  }
  process.exit(1)
}
console.log(
  `check-workflow-test-adjacency: ${
    workflowFilesOf(tracked).length
  } workflow file(s) each have an adjacent property test`,
)

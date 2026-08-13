#!/usr/bin/env -S deno test --allow-read=/tmp --allow-write=/tmp --allow-run=git
// Drives the real shell (`resolveBase`, `gather`) against real git repositories
// through the same `Exec` the hook uses, so a wrong assumption about git fails
// here rather than in a pull request. Every behavioural case names the defect it
// fails on.

import { assertEquals } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { classify, decide, type Facts, gather, gitIn, parseNumstat } from './guard-pr-lifecycle.ts'

const PR = { tool_name: 'Github', tool_input: { op: 'pr_create' } } as const

const git = (root: string, args: readonly string[]): Promise<{ code: number; stdout: string }> =>
  gitIn(root)(['-c', 'user.email=t@t', '-c', 'user.name=t', ...args])

const writeFiles = async (dir: string, files: Record<string, string>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    const slash = path.lastIndexOf('/')
    if (slash > 0) await Deno.mkdir(`${dir}/${path.slice(0, slash)}`, { recursive: true })
    await Deno.writeTextFile(`${dir}/${path}`, content)
  }
}

/** A repo on `main` carrying `base`, then a `work` branch carrying `head`. */
const repo = async (
  base: Record<string, string>,
  head: Record<string, string>,
): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: 'pr-gate-' })
  await git(dir, ['init', '--quiet', '--initial-branch=main'])
  await writeFiles(dir, base)
  await git(dir, ['add', '-A'])
  await git(dir, ['commit', '--quiet', '-m', 'base'])
  await git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  await git(dir, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'])
  await git(dir, ['checkout', '--quiet', '-b', 'work'])
  await writeFiles(dir, head)
  await git(dir, ['add', '-A'])
  await git(dir, ['commit', '--quiet', '-m', 'work'])
  return dir
}

const SOURCE = 'export const rate = (n: number) => n * 2\n'
const CHANGED = 'export const rate = (n: number) => n * 3\n'
const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n')

const factsFor = async (
  base: Record<string, string>,
  head: Record<string, string>,
  declared?: string,
): Promise<Facts> => gather(gitIn(await repo(base, head)), declared)

const refused = (facts: Facts): boolean => decide(PR, facts).refused

describe('classify', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['.github/workflows/ci.yml', 'evaluator'],
    ['.claude/hooks/guard.ts', 'evaluator'],
    ['.claude/commands/ship.md', 'evaluator'],
    ['scripts/guards/check.mjs', 'evaluator'],
    ['vitest.config.ts', 'evaluator'],
    ['src/__snapshots__/a.test.ts.snap', 'evaluator'],
    ['pnpm-lock.yaml', 'lockfile'],
    ['Pipfile.lock', 'lockfile'],
    ['flake.lock', 'lockfile'],
    ['gradle.lockfile', 'lockfile'],
    ['requirements.txt', 'source'],
    ['requirements-dev.txt', 'source'],
    ['package.json', 'source'],
    ['site/Button.mdx', 'source'],
    ['src/__generated__/api.ts', 'generated'],
    ['docs/guide.md', 'docs'],
    ['src/rate.ts', 'source'],
  ]
  for (const [path, expected] of cases) {
    it(`reads ${path} as ${expected}`, () => {
      assertEquals(classify(path), expected)
    })
  }
})

describe('parseNumstat', () => {
  it('sums added and deleted', () => {
    assertEquals(parseNumstat('3\t4\tsrc/a.ts\n'), [{ path: 'src/a.ts', lines: 7 }])
  })
  it('scores a binary file zero rather than NaN', () => {
    assertEquals(parseNumstat('-\t-\tlogo.png\n'), [{ path: 'logo.png', lines: 0 }])
  })
  it('ignores blank lines', () => {
    assertEquals(parseNumstat('\n\n'), [])
  })
})

describe('decide', () => {
  it('ignores an op that is not pr_create', async () => {
    const facts = await factsFor({ 'src/rate.ts': SOURCE }, { 'src/rate.ts': CHANGED })
    assertEquals(decide({ tool_input: { op: 'pr_checkout' } }, facts).refused, false)
  })

  it('allows a docs typo', async () => {
    assertEquals(refused(await factsFor({ 'README.md': 'helo\n' }, { 'README.md': 'hello\n' })), false)
  })

  it('refuses a behaviour change in source', async () => {
    assertEquals(refused(await factsFor({ 'src/rate.ts': SOURCE }, { 'src/rate.ts': CHANGED })), true)
  })

  it('allows a pure reformat, so whitespace vanishes from --ignore-all-space', async () => {
    const head = { 'src/rate.ts': 'export const rate = (n: number) =>    n * 2\n' }
    assertEquals(refused(await factsFor({ 'src/rate.ts': SOURCE }, head)), false)
  })

  it('refuses a change to the surface that judges the work', async () => {
    const facts = await factsFor({ '.github/workflows/ci.yml': 'on: push\n' }, {
      '.github/workflows/ci.yml': 'on: pull\n',
    })
    assertEquals(refused(facts), true)
  })

  it('refuses a docs rewrite over the line ceiling', async () => {
    const facts = await factsFor({ 'docs/g.md': lines(40) }, { 'docs/g.md': lines(40).toUpperCase() })
    assertEquals(refused(facts), true)
  })

  it('allows lockfile churn at any size', async () => {
    const facts = await factsFor({ 'pnpm-lock.yaml': lines(400) }, {
      'pnpm-lock.yaml': lines(400).toUpperCase(),
    })
    assertEquals(refused(facts), false)
  })

  // An unlisted lockfile fell through to source and was refused.
  it('allows churn in a lockfile outside the npm ecosystem', async () => {
    const facts = await factsFor({ 'Pipfile.lock': lines(300) }, {
      'Pipfile.lock': lines(300).toUpperCase(),
    })
    assertEquals(refused(facts), false)
  })

  // requirements.txt classified as docs, so a dependency add passed as trivial.
  it('refuses a dependency add to a manifest that ends .txt', async () => {
    const facts = await factsFor({ 'requirements.txt': 'flask==2.0\n' }, {
      'requirements.txt': 'flask==2.0\nrequests==2.31\n',
    })
    assertEquals(refused(facts), true)
  })

  // A snapshot encodes expectations, so editing one edits the judge.
  it('refuses a snapshot update', async () => {
    const facts = await factsFor({ 'src/__snapshots__/a.test.ts.snap': 'exports[`a`] = `1`;\n' }, {
      'src/__snapshots__/a.test.ts.snap': 'exports[`a`] = `2`;\n',
    })
    assertEquals(refused(facts), true)
  })

  it('refuses an edit to a custom command, which is agent behaviour not prose', async () => {
    const facts = await factsFor({ '.claude/commands/ship.md': 'do a\n' }, {
      '.claude/commands/ship.md': 'do b\n',
    })
    assertEquals(refused(facts), true)
  })

  it('refuses an mdx edit, which can carry components', async () => {
    const facts = await factsFor({ 'site/B.mdx': 'export const B = () => <b>1</b>\n' }, {
      'site/B.mdx': 'export const B = () => <b>2</b>\n',
    })
    assertEquals(refused(facts), true)
  })

  // Measuring the working tree let a committed change hidden by an uncommitted
  // revert vanish, so the PR carried it unseen.
  it('refuses a committed behaviour change that the working tree reverts', async () => {
    const dir = await repo({ 'src/rate.ts': SOURCE }, { 'src/rate.ts': `${CHANGED}${lines(12)}\n` })
    await git(dir, ['checkout', 'origin/main', '--', 'src/rate.ts'])
    assertEquals(refused(await gather(gitIn(dir), undefined)), true)
  })

  it('allows uncommitted work that the pull request does not carry', async () => {
    const dir = await repo({ 'README.md': 'helo\n' }, { 'README.md': 'hello\n' })
    await writeFiles(dir, { 'src/scratch.ts': `${CHANGED}${lines(30)}\n` })
    await git(dir, ['add', '-A'])
    assertEquals(refused(await gather(gitIn(dir), undefined)), false)
  })

  // Diffing the default branch judged a trivial child by its parent's diff.
  it('judges a branch against the base the call declares', async () => {
    const dir = await repo({ 'src/rate.ts': SOURCE, 'README.md': 'helo\n' }, { 'src/rate.ts': CHANGED })
    await git(dir, ['update-ref', 'refs/remotes/origin/parent', 'HEAD'])
    await git(dir, ['checkout', '--quiet', '-b', 'child'])
    await writeFiles(dir, { 'README.md': 'hello\n' })
    await git(dir, ['add', '-A'])
    await git(dir, ['commit', '--quiet', '-m', 'child'])
    assertEquals(refused(await gather(gitIn(dir), 'parent')), false)
  })

  it('refuses when no merge base resolves, rather than adjudicating nothing', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'pr-gate-' })
    await git(dir, ['init', '--quiet', '--initial-branch=main'])
    await writeFiles(dir, { 'a.txt': 'x\n' })
    await git(dir, ['add', '-A'])
    await git(dir, ['commit', '--quiet', '-m', 'only'])
    assertEquals(refused(await gather(gitIn(dir), undefined)), true)
  })
})

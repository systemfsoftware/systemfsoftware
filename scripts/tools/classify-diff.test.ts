import { assertEquals } from '@std/assert'
import { classify, parseGlobs } from './classify-diff.ts'

Deno.test('a plan alone is docs-only', () => {
  assertEquals(classify('pull_request', ['docs/plans/x.md']).scope, 'docs-only')
})

Deno.test('a package README beside a plan runs everything, because the README ships in the tarball', () => {
  assertEquals(classify('pull_request', ['docs/plans/x.md', 'packages/foo/README.md']), {
    scope: 'full',
    reason: 'outside-docs',
    path: 'packages/foo/README.md',
  })
})

Deno.test('nested agent instructions and a root markdown file are docs', () => {
  assertEquals(classify('pull_request', ['packages/x/AGENTS.md', 'a/b/CLAUDE.md', 'README.md']).scope, 'docs-only')
})

Deno.test('a markdown file below the root outside docs/ is not docs', () => {
  assertEquals(classify('pull_request', ['scripts/notes.md']).scope, 'full')
})

Deno.test('an empty or unreadable diff runs everything', () => {
  assertEquals(classify('pull_request', []), { scope: 'full', reason: 'no-paths' })
  assertEquals(classify('pull_request', undefined), { scope: 'full', reason: 'diff-unreadable' })
})

Deno.test('only a pull request can be docs-only', () => {
  for (const event of ['push', 'merge_group', 'workflow_dispatch', 'pull_request_target']) {
    assertEquals(classify(event, ['docs/x.md']), { scope: 'full', reason: 'not-a-pull-request' })
  }
})

Deno.test('a docs-globs list replaces the default set', () => {
  const globs = parseGlobs('notes/**\n')
  assertEquals(classify('pull_request', ['notes/a/b.md'], globs).scope, 'docs-only')
  assertEquals(classify('pull_request', ['docs/x.md'], globs).scope, 'full')
  assertEquals(parseGlobs('a/**, b.md\n\nc/*'), ['a/**', 'b.md', 'c/*'])
})

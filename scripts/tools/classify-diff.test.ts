import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { classify, parseGlobs } from './classify-diff.ts'

const here = dirname(fromFileUrl(import.meta.url))

// Runs the published command the way the composite does, and returns what it left in GITHUB_OUTPUT and on stdout.
const classifyDiff = async (paths: readonly string[]) => {
  const dir = await Deno.makeTempDir()
  const pathsFile = join(dir, 'paths')
  const outputFile = join(dir, 'github-output')
  await Deno.writeTextFile(pathsFile, paths.map((path) => `${path}\0`).join(''))
  await Deno.writeTextFile(outputFile, '')
  const args = [
    'run',
    `--config=${join(here, '..', 'deno.jsonc')}`,
    `--lock=${join(here, '..', 'deno.lock')}`,
    '--frozen',
    '--allow-read',
    '--allow-write',
    '--allow-env',
    join(here, 'classify-diff.ts'),
    '--event',
    'pull_request',
    '--paths',
    pathsFile,
  ]
  const out = await new Deno.Command(Deno.execPath(), { args, env: { GITHUB_OUTPUT: outputFile }, stdout: 'piped' })
    .output()
  assertEquals(out.code, 0)
  const output = await Deno.readTextFile(outputFile)
  await Deno.remove(dir, { recursive: true })
  return { output, stdout: new TextDecoder().decode(out.stdout) }
}

Deno.test('a path that embeds a newline and a forged scope cannot reach GITHUB_OUTPUT', async () => {
  const { output, stdout } = await classifyDiff(['src/x\nscope=docs-only'])
  assertEquals(output, 'scope=full\nreason=outside-docs\n')
  assertStringIncludes(stdout, JSON.stringify('src/x\nscope=docs-only'))
})

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

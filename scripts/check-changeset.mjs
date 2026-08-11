#!/usr/bin/env -S deno run --allow-run=git --allow-read
// check-changeset.mjs — the changeset gate for publishable-package PRs.
// Fails (exit 1) when a PR touches packages/** without a changeset-shaped
// .changeset/*.md intent. Invoked by .github/workflows/changeset-check.yml.
// Pathspec glob expansion is done by git, not the shell.

const base = Deno.args[0]
if (!base) {
  console.error('usage: check-changeset.mjs <base-ref>')
  Deno.exit(2)
}

const dec = new TextDecoder()
const git = (args) => {
  const out = new Deno.Command('git', { args, stdout: 'piped', stderr: 'piped' }).outputSync()
  if (!out.success) {
    console.error(`::error::git ${args[0]} failed: ${dec.decode(out.stderr).trim()}`)
    Deno.exit(1)
  }
  return dec.decode(out.stdout)
}

const range = `origin/${base}...HEAD`
const changed = git(['diff', '--name-only', range]).split('\n').filter(Boolean)
if (!changed.some((f) => f.startsWith('packages/'))) {
  console.log('no publishable-package (packages/**) files in this PR — skipping')
  Deno.exit(0)
}

const intents = git(['diff', '--name-only', '--diff-filter=AM', range, '--', '.changeset/*.md'])
  .split('\n').filter(Boolean)
  .filter((f) => f !== '.changeset/README.md')

if (intents.length === 0) {
  console.error(
    '::error::This PR touches a publishable package (packages/**) but adds no changeset. ' +
      'Run `pnpm change --bump <none|patch|minor|major> --summary "<summary>" <pkg>` and commit the intent.',
  )
  Deno.exit(1)
}

const bumpRe = /["']?@?[a-z0-9/_@.-]+["']?\s*:\s*(none|patch|minor|major)/i
const wellFormed = intents.some((f) => {
  try {
    return bumpRe.test(Deno.readTextFileSync(f))
  } catch {
    return false
  }
})
if (!wellFormed) {
  console.error('::error::.changeset/*.md present but none declares a package bump in its frontmatter.')
  Deno.exit(1)
}
console.log('changeset present and well-formed.')

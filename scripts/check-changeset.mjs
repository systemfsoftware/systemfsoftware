#!/usr/bin/env -S deno run --allow-run=git --allow-read
// check-changeset.mjs — the changeset gate for publishable-package PRs.
// Fails (exit 1) when a PR touches packages/** without a changeset-shaped
// .changeset/*.md intent. Invoked by .github/workflows/changeset-check.yml.
// Pathspec glob expansion is done by git, not the shell.

const dec = new TextDecoder()

const git = async (args) => {
  const out = await new Deno.Command('git', { args, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) {
    throw new Error(`git ${args[0]} failed: ${dec.decode(out.stderr).trim()}`)
  }
  return dec.decode(out.stdout)
}

const bumpRe = /["']?@?[a-z0-9/_@.-]+["']?\s*:\s*(none|patch|minor|major)/i

const main = async () => {
  const base = Deno.args[0]
  if (!base) {
    console.error('usage: check-changeset.mjs <base-ref>')
    return 2
  }

  const range = `origin/${base}...HEAD`
  const changed = (await git(['diff', '--name-only', range])).split('\n').filter(Boolean)
  if (!changed.some((f) => f.startsWith('packages/'))) {
    console.log('no publishable-package (packages/**) files in this PR — skipping')
    return 0
  }

  const intents = (await git(['diff', '--name-only', '--diff-filter=AM', range, '--', '.changeset/*.md']))
    .split('\n').filter(Boolean)
    .filter((f) => f !== '.changeset/README.md')

  if (intents.length === 0) {
    console.error(
      '::error::This PR touches a publishable package (packages/**) but adds no changeset. ' +
        'Run `pnpm change --bump <none|patch|minor|major> --summary "<summary>" <pkg>` and commit the intent.',
    )
    return 1
  }

  // Independent reads, so they run concurrently. An unreadable file is not
  // well-formed, which is what the original per-file try/catch already meant.
  const bodies = await Promise.all(intents.map((f) => Deno.readTextFile(f).catch(() => null)))
  if (!bodies.some((text) => text !== null && bumpRe.test(text))) {
    console.error('::error::.changeset/*.md present but none declares a package bump in its frontmatter.')
    return 1
  }

  console.log('changeset present and well-formed.')
  return 0
}

try {
  Deno.exitCode = await main()
} catch (error) {
  console.error(`::error::${error.message}`)
  Deno.exitCode = 1
}

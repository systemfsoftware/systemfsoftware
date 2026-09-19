#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=git,pnpm --allow-env=GITHUB_REPOSITORY --allow-net=registry.npmjs.org
// tag-released-packages.ts — capture the release set, publish the versions npm
// does not yet serve, and tag them.
//
// Modes:
//   --dry-run --json --output <file>  capture the release set without tagging
//   --captured <file>                 reuse a prior capture
//   --unpublished                     narrow a captured set to versions npm
//                                     returns 404 for (used with --publish)
//   --publish                         run `pnpm publish -r` over the workspace
//
// The release set is a registry fact (`./cycle.ts`). A package leaves it
// when its version is published, never when a tag is written — so a killed
// publish leaves registry 404s that the next run re-derives.

import { parseArgs } from '@std/cli/parse-args'
import { loadCaptured, loadWorkspaceCycle, unpublishedOf } from './cycle.ts'
import { expectedSlug } from './oidc.ts'
import { run } from './run.ts'

const flags = parseArgs(Deno.args, {
  boolean: ['dry-run', 'json', 'unpublished', 'publish'],
  string: ['output', 'captured'],
})

const loaded = flags.captured ? await loadCaptured(flags.captured) : await loadWorkspaceCycle()
const cycle = flags.captured && flags.unpublished ? await unpublishedOf(loaded) : loaded

if (flags.publish) {
  if (cycle.length === 0) {
    console.log('every captured version is already on npm — nothing to publish')
    Deno.exit(0)
  }
  console.log(`re-checking ${cycle.length} captured version(s) against npm, then publishing recursively`)
  const published = await new Deno.Command('pnpm', {
    args: ['publish', '-r', '--provenance', '--access', 'public', '--no-git-checks'],
    stdout: 'inherit',
    stderr: 'inherit',
  }).output()
  if (!published.success) {
    const slug = await expectedSlug().catch((error) => {
      console.error(
        `::warning::could not derive the repository slug: ${error instanceof Error ? error.message : String(error)}`,
      )
      return '<owner>/<repo>'
    })
    console.error(
      `::error::pnpm publish failed (exit ${published.code}).`,
    )
    console.error(
      `\nIf OIDC authentication failed because packages are not yet published or trusted:`,
    )
    console.error(
      `Run \`pnpm publish:unpublished\` (or \`pnpm publish:unpublished --fix\` to align repository URLs to ${slug}) to debut unpublished packages and register trusted publishing.`,
    )
    Deno.exit(published.code || 1)
  }
  Deno.exit(0)
}

if (flags.output) {
  await Deno.writeTextFile(flags.output, JSON.stringify(cycle, null, 2))
  console.error(`wrote ${cycle.length} captured package(s) to ${flags.output}`)
}

if (flags.json) {
  console.log(JSON.stringify(cycle))
  Deno.exit(0)
}

if (flags['dry-run'] || flags.output) {
  for (const { tag } of cycle) console.log(`would tag ${tag}`)
  console.log(`dry run: ${cycle.length} tag(s)`)
  Deno.exit(0)
}

if (cycle.length === 0) {
  console.log('no new tags to push')
  Deno.exit(0)
}

const made: string[] = []
for (const { tag } of cycle) {
  await run('git', ['tag', tag])
  made.push(tag)
}
await run('git', ['push', 'origin', ...made.map((t) => `refs/tags/${t}`)])
console.log(`pushed ${made.length} tag(s): ${made.join(', ')}`)

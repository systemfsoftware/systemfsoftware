#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=git,pnpm --allow-env=GITHUB_REPOSITORY --allow-net=registry.npmjs.org
// tag-released-packages.ts — capture the release set, publish the versions npm
// does not yet serve, and tag them.
//
// Modes:
//   --dry-run --json --output <file>  capture the release set without tagging
//   --captured <file>                 reuse a prior capture
//   --unpublished                     narrow a captured set to versions npm
//                                     returns 404 for (used with --publish)
//   --publish                         publish the captured set with
//                                     `pnpm publish -r --filter`, then settle
//                                     the verdict against the registry
//
// The release set is a registry fact (`./cycle.ts`). A package leaves it
// when its version is published, never when a tag is written — so a killed
// publish leaves registry 404s that the next run re-derives.

import { parseArgs } from '@std/cli/parse-args'
import { loadCaptured, loadWorkspaceCycle, unpublishedOf } from './cycle.ts'
import { expectedSlug } from './oidc.ts'
import { labeled, publishArgs, publishVerdict, staleEntries } from './publish-set.ts'
import { run } from './run.ts'
import { rawWorkspacePackages } from './workspace.ts'

const flags = parseArgs(Deno.args, {
  boolean: ['dry-run', 'json', 'unpublished', 'publish'],
  string: ['output', 'captured'],
})

const loaded = flags.captured ? await loadCaptured(flags.captured) : await loadWorkspaceCycle()
const cycle = flags.captured && flags.unpublished ? await unpublishedOf(loaded) : loaded

// A captured set is only as live as the file it came from — `loadWorkspaceCycle`
// derives from the workspace itself and cannot name a package it does not
// manifest. pnpm selects projects rather than versions, so a stale name drops
// out of the publish silently and the entry's version is never checked against
// the manifest; the tag and GitHub Release steps would still run for a version
// npm never received.
if (flags.captured) {
  const stale = staleEntries(cycle, await rawWorkspacePackages())
  if (stale.length > 0) {
    console.error(
      `::error::the captured set names ${stale.length} package(s) this workspace does not manifest: ${labeled(stale)}`,
    )
    Deno.exit(1)
  }
}

if (flags.publish) {
  if (cycle.length === 0) {
    console.log('every captured version is already on npm — nothing to publish')
    Deno.exit(0)
  }
  console.log(`publishing ${cycle.length} captured version(s): ${labeled(cycle)}`)
  const published = await new Deno.Command('pnpm', {
    args: publishArgs(cycle),
    stdout: 'inherit',
    stderr: 'inherit',
  }).output()
  const owed = published.success ? [] : await unpublishedOf(cycle).catch((error) => {
    console.error(
      `::warning::could not re-check the release set against npm: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return [...cycle]
  })
  const verdict = publishVerdict(published.success, owed)
  if (verdict === 'converged') {
    console.log(
      `pnpm publish failed (exit ${published.code}), but nothing is owed — every captured version is on npm`,
    )
  }
  if (verdict !== 'owed') Deno.exit(0)
  const slug = await expectedSlug().catch((error) => {
    console.error(
      `::warning::could not derive the repository slug: ${error instanceof Error ? error.message : String(error)}`,
    )
    return '<owner>/<repo>'
  })
  console.error(`::error::pnpm publish failed (exit ${published.code}); still owed: ${labeled(owed)}`)
  console.error(
    `\nIf OIDC authentication failed because packages are not yet published or trusted:`,
  )
  console.error(
    `Run \`pnpm publish:unpublished\` (or \`pnpm publish:unpublished --fix\` to align repository URLs to ${slug}) to debut unpublished packages and register trusted publishing.`,
  )
  Deno.exit(published.code || 1)
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

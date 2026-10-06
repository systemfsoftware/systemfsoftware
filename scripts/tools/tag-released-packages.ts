#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=git,pnpm --allow-env=GITHUB_REPOSITORY
import { parseArgs } from '@std/cli/parse-args'
import { loadCaptured, loadWorkspaceCycle } from './cycle.ts'
import type { CycleEntry } from './cycle.ts'
import { run } from './run.ts'
import { rawWorkspacePackages } from './workspace.ts'
import type { WorkspaceMember } from './workspace.ts'

const flags = parseArgs(Deno.args, {
  boolean: ['dry-run', 'json'],
  string: ['output', 'captured'],
})

const failWith = (message: string): never => {
  console.error(`::error::${message}`)
  Deno.exit(1)
}

const labeled = (cycle: readonly CycleEntry[]): string =>
  cycle.map(({ name, version }) => `${name}@${version}`).join(', ')

/** Captured entries this workspace no longer manifests at the captured version. */
const staleEntries = (
  cycle: readonly CycleEntry[],
  members: readonly WorkspaceMember[],
): CycleEntry[] =>
  cycle.filter(({ name, version }) => !members.some((member) => member.name === name && member.version === version))

const planTags = (
  tags: readonly string[],
  commitByExistingTag: ReadonlyMap<string, string>,
  head: string,
): { create: string[]; alreadyAtHead: string[]; atAnotherCommit: string[] } => ({
  create: tags.filter((tag) => !commitByExistingTag.has(tag)),
  alreadyAtHead: tags.filter((tag) => commitByExistingTag.get(tag) === head),
  atAnotherCommit: tags.filter((tag) => commitByExistingTag.has(tag) && commitByExistingTag.get(tag) !== head),
})

const cycle = flags.captured ? await loadCaptured(flags.captured) : await loadWorkspaceCycle()

if (flags.captured) {
  const stale = staleEntries(cycle, await rawWorkspacePackages())
  if (stale.length > 0) {
    failWith(`the captured set names ${stale.length} package(s) this workspace does not manifest: ${labeled(stale)}`)
  }
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

const commitByExistingTag = async (): Promise<Map<string, string>> => {
  const listing = await run('git', [
    'for-each-ref',
    '--format=%(refname:strip=2)%09%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)',
    'refs/tags',
  ])
  return new Map(
    listing
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [tag = '', commit = ''] = line.split('\t')
        return [tag, commit]
      }),
  )
}

const head = (await run('git', ['rev-parse', 'HEAD'])).trim()
const { create, alreadyAtHead, atAnotherCommit } = planTags(
  cycle.map(({ tag }) => tag),
  await commitByExistingTag(),
  head,
)

if (atAnotherCommit.length > 0) failWith(`already tagged at another commit: ${atAnotherCommit.join(', ')}`)
if (alreadyAtHead.length > 0) console.log(`already tagged at HEAD: ${alreadyAtHead.join(', ')}`)
if (create.length === 0) {
  console.log('no new tags to push')
  Deno.exit(0)
}

for (const tag of create) await run('git', ['tag', tag])
await run('git', ['push', 'origin', ...create.map((tag) => `refs/tags/${tag}`)])
console.log(`pushed ${create.length} tag(s): ${create.join(', ')}`)

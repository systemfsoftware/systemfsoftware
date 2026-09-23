#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=git,pnpm --allow-env=GITHUB_REPOSITORY --allow-net=registry.npmjs.org
import { parseArgs } from '@std/cli/parse-args'
import { type CycleEntry, loadCaptured, loadWorkspaceCycle, unpublishedOf } from './cycle.ts'
import { expectedSlug } from './oidc.ts'
import {
  labeled,
  planTags,
  publishArgs,
  type PublishOutcome,
  publishOutcome,
  publishVerdict,
  staleEntries,
} from './publish-set.ts'
import { run } from './run.ts'
import { rawWorkspacePackages } from './workspace.ts'

const flags = parseArgs(Deno.args, {
  boolean: ['dry-run', 'json', 'unpublished', 'publish'],
  string: ['output', 'captured'],
})

const failWith = (message: string): never => {
  console.error(`::error::${message}`)
  Deno.exit(1)
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const loaded = flags.captured ? await loadCaptured(flags.captured) : await loadWorkspaceCycle()
const cycle = flags.captured && flags.unpublished ? await unpublishedOf(loaded) : loaded

if (flags.captured) {
  const stale = staleEntries(cycle, await rawWorkspacePackages())
  if (stale.length > 0) {
    failWith(`the captured set names ${stale.length} package(s) this workspace does not manifest: ${labeled(stale)}`)
  }
}

const decoder = new TextDecoder()

const publishOne = async (entry: CycleEntry): Promise<PublishOutcome> => {
  const { success, stdout, stderr } = await new Deno.Command('pnpm', {
    args: publishArgs(entry),
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  const output = decoder.decode(stdout) + decoder.decode(stderr)
  console.log(output.trimEnd())
  return publishOutcome(success, output)
}

const stillUnpublishedAfterRecheck = (failed: readonly CycleEntry[]): Promise<CycleEntry[]> =>
  unpublishedOf([...failed]).catch((error) => {
    console.error(`::warning::could not re-check the release set against npm: ${messageOf(error)}`)
    return [...failed]
  })

if (flags.publish) {
  if (cycle.length === 0) {
    console.log('every captured version is already on npm — nothing to publish')
    Deno.exit(0)
  }
  console.log(`publishing ${cycle.length} captured version(s): ${labeled(cycle)}`)
  const outcomes: { entry: CycleEntry; outcome: PublishOutcome }[] = []
  for (const entry of cycle) outcomes.push({ entry, outcome: await publishOne(entry) })
  const entriesWith = (wanted: PublishOutcome): CycleEntry[] =>
    outcomes.filter(({ outcome }) => outcome === wanted).map(({ entry }) => entry)

  const held = entriesWith('held')
  if (held.length > 0) console.log(`::notice::npm already holds ${labeled(held)} from an earlier publish`)

  const failed = entriesWith('failed')
  const stillUnpublished = failed.length === 0 ? [] : await stillUnpublishedAfterRecheck(failed)
  const verdict = publishVerdict(failed.length === 0, stillUnpublished)
  if (verdict === 'converged') console.log(`pnpm publish failed for ${labeled(failed)}, yet npm serves every one`)
  if (verdict !== 'owed') Deno.exit(0)

  const slug = await expectedSlug().catch((error) => {
    console.error(`::warning::could not derive the repository slug: ${messageOf(error)}`)
    return '<owner>/<repo>'
  })
  console.error(`::error::pnpm publish failed; still owed: ${labeled(stillUnpublished)}`)
  console.error(`\nIf OIDC authentication failed because packages are not yet published or trusted:`)
  console.error(
    `Run \`pnpm publish:unpublished\` (or \`pnpm publish:unpublished --fix\` to align repository URLs to ${slug}) to debut unpublished packages and register trusted publishing.`,
  )
  Deno.exit(1)
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

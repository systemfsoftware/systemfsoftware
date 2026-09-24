import { assertEquals } from '@std/assert'
import { changelogPath, type CycleEntry } from './cycle.ts'
import { planTags, publishArgs, publishOutcome, publishVerdict, staleEntries } from './publish-set.ts'
import type { WorkspaceMember } from './workspace.ts'

const entry = (name: string, version: string): CycleEntry => ({
  name,
  version,
  tag: `${name}@v${version}`,
  changelog: changelogPath(name, version),
})

const member = (name: string, version: string): WorkspaceMember => ({ name, version, path: `packages/${name}` })

Deno.test('one package is named as the filter, so pnpm cannot publish outside it', () => {
  assertEquals(publishArgs(entry('@scope/a', '1.0.0')), [
    'publish',
    '-r',
    '--provenance',
    '--access',
    'public',
    '--no-git-checks',
    '--fail-if-no-match',
    '--filter',
    '@scope/a',
  ])
})

Deno.test('a captured entry the workspace manifests is not stale', () => {
  assertEquals(staleEntries([entry('@scope/a', '1.0.0')], [member('@scope/a', '1.0.0')]), [])
})

Deno.test('a captured entry the workspace no longer manifests is stale', () => {
  const members = [member('@scope/a', '1.0.0')]
  const gone = [entry('@scope/gone', '1.0.0')]
  const bumped = [entry('@scope/a', '2.0.0')]
  assertEquals(staleEntries([...gone, entry('@scope/a', '1.0.0')], members), gone)
  assertEquals(staleEntries(bumped, members), bumped)
})

Deno.test('a successful publish is the verdict whatever the follow-up check says', () => {
  assertEquals(publishVerdict(true, []), 'published')
  assertEquals(publishVerdict(true, [entry('@scope/a', '1.0.0')]), 'published')
})

Deno.test('a failed publish that owes nothing converged — a version already on npm is not a failure', () => {
  assertEquals(publishVerdict(false, []), 'converged')
})

Deno.test('a failed publish that still owes a version is owed it', () => {
  assertEquals(publishVerdict(false, [entry('@scope/a', '1.0.0')]), 'owed')
})

const pnpm12RefusalWhileNpmScans = `Error: ERR_PNPM_FAILED_TO_PUBLISH

  × Failed to publish package @systemfsoftware/effect-daemon-spec@4.1.0
  │ (status 409 Conflict): {"success":false,"error":"Cannot publish over
  │ previously staged version \\"4.1.0\\"."}
`

const refusalOnceNpmServes =
  'pnpm: 403 Forbidden - PUT https://registry.npmjs.org/@scope%2fa - You cannot publish over the previously published versions: 1.0.0.'

Deno.test('npm refusing a version it is still scanning holds that version', () => {
  assertEquals(publishOutcome(false, pnpm12RefusalWhileNpmScans), 'held')
})

Deno.test('npm refusing a version it already serves holds that version', () => {
  assertEquals(publishOutcome(false, refusalOnceNpmServes), 'held')
})

Deno.test('any other refusal is a failed publish', () => {
  assertEquals(publishOutcome(false, 'pnpm: 404 Not Found - PUT https://registry.npmjs.org/@scope%2fa'), 'failed')
  assertEquals(publishOutcome(false, ''), 'failed')
})

Deno.test('a publish pnpm reports as successful is accepted whatever it printed', () => {
  assertEquals(publishOutcome(true, pnpm12RefusalWhileNpmScans), 'accepted')
})

Deno.test('a tag absent from the repository is created', () => {
  assertEquals(planTags(['a@v1'], new Map(), 'head'), { create: ['a@v1'], alreadyAtHead: [], atAnotherCommit: [] })
})

Deno.test('a tag an earlier run of this commit already wrote is not written again', () => {
  assertEquals(planTags(['a@v1', 'b@v1'], new Map([['a@v1', 'head']]), 'head'), {
    create: ['b@v1'],
    alreadyAtHead: ['a@v1'],
    atAnotherCommit: [],
  })
})

Deno.test('a tag at another commit is neither moved nor treated as released here', () => {
  assertEquals(planTags(['a@v1'], new Map([['a@v1', 'elsewhere']]), 'head'), {
    create: [],
    alreadyAtHead: [],
    atAnotherCommit: ['a@v1'],
  })
})

import { assertEquals } from '@std/assert'
import { changelogPath, type CycleEntry } from './cycle.ts'
import { publishArgs, publishVerdict, staleEntries } from './publish-set.ts'
import type { WorkspaceMember } from './workspace.ts'

const entry = (name: string, version: string): CycleEntry => ({
  name,
  version,
  tag: `${name}@v${version}`,
  changelog: changelogPath(name, version),
})

const member = (name: string, version: string): WorkspaceMember => ({ name, version, path: `packages/${name}` })

Deno.test('an empty set publishes with no filter', () => {
  assertEquals(publishArgs([]), [
    'publish',
    '-r',
    '--provenance',
    '--access',
    'public',
    '--no-git-checks',
    '--fail-if-no-match',
  ])
})

Deno.test('every captured package is named as a filter, so pnpm cannot publish outside the set', () => {
  assertEquals(publishArgs([entry('@scope/a', '1.0.0'), entry('@scope/b', '2.0.0')]), [
    'publish',
    '-r',
    '--provenance',
    '--access',
    'public',
    '--no-git-checks',
    '--fail-if-no-match',
    '--filter',
    '@scope/a',
    '--filter',
    '@scope/b',
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

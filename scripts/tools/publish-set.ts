import type { CycleEntry } from './cycle.ts'
import type { WorkspaceMember } from './workspace.ts'

export type PublishOutcome = 'accepted' | 'held' | 'failed'

export const publishArgs = ({ name }: CycleEntry): string[] => [
  'publish',
  '-r',
  '--provenance',
  '--access',
  'public',
  '--no-git-checks',
  '--fail-if-no-match',
  '--filter',
  name,
]

export const staleEntries = (
  cycle: readonly CycleEntry[],
  members: readonly WorkspaceMember[],
): CycleEntry[] =>
  cycle.filter(({ name, version }) => !members.some((member) => member.name === name && member.version === version))

export const labeled = (cycle: readonly CycleEntry[]): string =>
  cycle.map(({ name, version }) => `${name}@${version}`).join(', ')

const refusalsMeaningNpmAlreadyHoldsTheVersion = [
  'previously staged version',
  'cannot publish over the previously published versions',
]

const unwrapPnpmBox = (output: string): string => output.replaceAll('│', ' ').replace(/\s+/g, ' ').toLowerCase()

export const publishOutcome = (succeeded: boolean, output: string): PublishOutcome => {
  if (succeeded) return 'accepted'
  const prose = unwrapPnpmBox(output)
  return refusalsMeaningNpmAlreadyHoldsTheVersion.some((refusal) => prose.includes(refusal)) ? 'held' : 'failed'
}

export const publishVerdict = (
  succeeded: boolean,
  stillUnpublished: readonly CycleEntry[],
): 'published' | 'converged' | 'owed' => {
  if (succeeded) return 'published'
  return stillUnpublished.length === 0 ? 'converged' : 'owed'
}

export const planTags = (
  tags: readonly string[],
  commitByExistingTag: ReadonlyMap<string, string>,
  head: string,
): { create: string[]; alreadyAtHead: string[]; atAnotherCommit: string[] } => ({
  create: tags.filter((tag) => !commitByExistingTag.has(tag)),
  alreadyAtHead: tags.filter((tag) => commitByExistingTag.get(tag) === head),
  atAnotherCommit: tags.filter((tag) => commitByExistingTag.has(tag) && commitByExistingTag.get(tag) !== head),
})

import { Context, Effect } from 'effect'

export class ReferencedContent
  extends Context.Service<ReferencedContent, { readonly load: () => Effect.Effect<string> }>()(
    '@systemfsoftware/omp-claude-compat/inject/ReferencedContent',
  )
{}

export const DEFAULT_NO_INJECT_REFS: readonly string[] = ['AGENTS.md']

export interface Ref {
  readonly sourcePath: string
  readonly resolvedPath: string
}

export const buildInjectedContent = (
  projectDir: string,
  uniqueRefs: readonly Ref[],
  refContents: Readonly<Record<string, string>>,
  skipList: readonly string[],
): string => {
  const sections: string[] = []
  for (const ref of uniqueRefs) {
    const relativePath = ref.resolvedPath.slice(projectDir.length + 1)
    if (skipList.includes(relativePath)) continue

    const refContent = refContents[ref.resolvedPath]
    if (refContent === undefined) {
      continue
    }

    sections.push(`## ${relativePath}\n${refContent}\n`)
  }

  if (sections.length === 0) return ''

  return [
    '# Injected @-references from CLAUDE.md',
    'The following files were @-imported by CLAUDE.md and contain project rules.',
    '',
    ...sections,
  ].join('\n')
}

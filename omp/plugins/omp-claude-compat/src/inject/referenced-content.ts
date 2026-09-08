import { Context, Effect } from 'effect'
import type * as FileSystem from 'effect/FileSystem'

export class ReferencedContent extends Context.Service<
  ReferencedContent,
  { readonly load: (cwd: string) => Effect.Effect<string, never, FileSystem.FileSystem> }
>()(
  '@systemfsoftware/omp-claude-compat/inject/ReferencedContent',
) {}

export interface Ref {
  readonly sourcePath: string
  readonly resolvedPath: string
}

export interface BuildInjectedContentOptions {
  readonly projectDir: string
  readonly uniqueRefs: readonly Ref[]
  readonly refContents: Readonly<Record<string, string>>
  readonly skipList: readonly string[]
}

export const buildInjectedContent = (options: BuildInjectedContentOptions): string => {
  const { projectDir, uniqueRefs, refContents, skipList } = options
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

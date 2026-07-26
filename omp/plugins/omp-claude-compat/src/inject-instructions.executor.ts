import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Effect, Either } from 'effect'

interface Ref {
  readonly sourcePath: string
  readonly resolvedPath: string
}

const extractRefs = Effect.fn('extractRefs')(function*(content: string, baseDir: string, projectDir: string) {
  const fs = yield* FileSystem
  const path = yield* PathModule.Path
  const refs: Ref[] = []
  for (const rawLine of content.split('\n')) {
    const noMarker = rawLine.trim().replace(/^[-*+]\s+/, '')
    if (!noMarker.startsWith('@')) continue
    const ref = noMarker.slice(1).trim()
    if (!ref || ref.includes(' ')) continue
    if (path.isAbsolute(ref)) continue

    const baseResolved = path.resolve(baseDir, ref)
    const confinedBase = baseResolved.startsWith(projectDir + '/') || baseResolved === projectDir

    if (confinedBase) {
      const baseExists = yield* Effect.either(fs.exists(baseResolved))
      if (Either.isRight(baseExists) && baseExists.right) {
        refs.push({ sourcePath: baseDir, resolvedPath: baseResolved })
        continue
      }
    }

    const rootResolved = path.resolve(projectDir, ref)
    const confinedRoot = rootResolved.startsWith(projectDir + '/') || rootResolved === projectDir
    if (confinedRoot && rootResolved !== baseResolved) {
      refs.push({ sourcePath: projectDir, resolvedPath: rootResolved })
    }
  }
  return refs
})

/**
 * Collect the content of every `@`-ref in CLAUDE.md that the host has not
 * already delivered.
 *
 * `alreadyRendered` is the system prompt as built so far. The host discovers
 * context files (AGENTS.md and the like) on its own and renders them into
 * `<repo-rules>`, so a `CLAUDE.md` consisting of `@AGENTS.md` would otherwise
 * inject a byte-identical second copy. Refs the host does not load — a
 * `@docs/style.md`, say — are still injected; that is this compat shim's
 * whole job.
 */
export const loadReferencedContent = Effect.fn('loadReferencedContent')(function*(
  projectDir: string,
  alreadyRendered: readonly string[] = [],
) {
  const fs = yield* FileSystem
  const path = yield* PathModule.Path
  const claudeMdPaths = [
    path.resolve(projectDir, 'CLAUDE.md'),
    path.resolve(projectDir, '.claude', 'CLAUDE.md'),
  ]

  const allRefs: Ref[] = []
  for (const filePath of claudeMdPaths) {
    const content = yield* Effect.either(
      fs.readFileString(filePath, 'utf-8'),
    )
    if (Either.isRight(content)) {
      const refs = yield* extractRefs(content.right, path.dirname(filePath), projectDir)
      allRefs.push(...refs)
    }
  }

  const seen = new Set<string>()
  const uniqueRefs: Ref[] = []
  for (const ref of allRefs) {
    if (!seen.has(ref.resolvedPath)) {
      seen.add(ref.resolvedPath)
      uniqueRefs.push(ref)
    }
  }

  const rendered = alreadyRendered.join('\n')

  const sections: string[] = []
  for (const ref of uniqueRefs) {
    const exists = yield* Effect.either(fs.exists(ref.resolvedPath))
    if (!(Either.isRight(exists) && exists.right)) continue

    const relativePath = ref.resolvedPath.slice(projectDir.length + 1)
    const refContent = yield* Effect.either(
      fs.readFileString(ref.resolvedPath, 'utf-8'),
    )
    if (Either.isLeft(refContent)) {
      sections.push(`## ${relativePath}\n[error reading ${relativePath}]\n`)
      continue
    }

    // Content identity is the host's own dedupe key for context files
    // (`dedupeExactContextFiles` in system-prompt.ts), so match on it here
    // rather than guessing at the host's discovery rules. An empty file
    // trivially matches everything, so it never suppresses.
    const body = refContent.right.trim()
    if (body.length > 0 && rendered.includes(body)) continue

    sections.push(`## ${relativePath}\n${refContent.right}\n`)
  }

  if (sections.length === 0) return ''

  return [
    '# Injected @-references from CLAUDE.md',
    'The following files were @-imported by CLAUDE.md and contain project rules.',
    '',
    ...sections,
  ].join('\n')
})

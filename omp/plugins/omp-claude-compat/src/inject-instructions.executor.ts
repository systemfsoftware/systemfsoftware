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

export const loadReferencedContent = Effect.fn('loadReferencedContent')(function*(projectDir: string) {
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

  const validRefs: Ref[] = []
  for (const ref of uniqueRefs) {
    const exists = yield* Effect.either(fs.exists(ref.resolvedPath))
    if (Either.isRight(exists) && exists.right) {
      validRefs.push(ref)
    }
  }

  if (validRefs.length === 0) return ''

  const parts: string[] = ['# Injected @-references from CLAUDE.md']
  parts.push('The following files were @-imported by CLAUDE.md and contain project rules.')
  parts.push('')

  for (const ref of validRefs) {
    const relativePath = ref.resolvedPath.slice(projectDir.length + 1)
    parts.push(`## ${relativePath}`)
    const refContent = yield* Effect.either(
      fs.readFileString(ref.resolvedPath, 'utf-8'),
    )
    if (Either.isRight(refContent)) {
      parts.push(refContent.right)
    } else {
      parts.push(`[error reading ${relativePath}]`)
    }
    parts.push('')
  }

  return parts.join('\n')
})

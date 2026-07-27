import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { TomlLoader } from '@systemfsoftware/omp-utils'
import { Effect, Either, Match, Option } from 'effect'
import { decideRefInjection, DEFAULT_NO_INJECT_REFS } from './inject-instructions.workflow.js'

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
 * Collect the content of every `@`-ref in CLAUDE.md that the host does not
 * already deliver, deciding each ref through `decideRefInjection`.
 */
export const loadReferencedContent = Effect.fn('loadReferencedContent')(function*(projectDir: string) {
  const fs = yield* FileSystem
  const path = yield* PathModule.Path
  const tomlLoader = yield* TomlLoader

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

  const config = yield* tomlLoader.load(projectDir).pipe(
    Effect.catchAll(() => Effect.succeed(undefined)),
  )
  const skipList = config?.['no_inject_refs'] ?? DEFAULT_NO_INJECT_REFS

  const sections: string[] = []
  for (const ref of uniqueRefs) {
    const relativePath = ref.resolvedPath.slice(projectDir.length + 1)
    const suppressed = Match.value(
      decideRefInjection({ relativePath, skipList }),
    ).pipe(
      Match.tag('Skip', (skip) => Option.some(skip.matched)),
      Match.tag('Inject', () => Option.none<string>()),
      Match.exhaustive,
    )
    if (Option.isSome(suppressed)) {
      continue
    }

    const refContent = yield* Effect.either(
      fs.readFileString(ref.resolvedPath, 'utf-8'),
    )
    if (Either.isLeft(refContent)) {
      continue
    }

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

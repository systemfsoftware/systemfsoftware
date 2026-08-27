import { Effect, HashSet, Layer, Result } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { NoInjectRefs } from './no-inject-refs.js'
import { buildInjectedContent, ReferencedContent } from './referenced-content.js'
import type { Ref } from './referenced-content.js'

const parseRefToken = (rawLine: string, path: PathModule.Path): string | null => {
  const noMarker = rawLine.trim().replace(/^[-*+]\s+/, '')
  if (!noMarker.startsWith('@')) return null
  const ref = noMarker.slice(1).trim()
  if (!ref || ref.includes(' ')) return null
  if (path.isAbsolute(ref)) return null
  return ref
}

const isConfined = (resolved: string, projectDir: string): boolean =>
  resolved.startsWith(projectDir + '/') || resolved === projectDir

export const FileReferencedContentLive = Layer.effect(
  ReferencedContent,
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const path = yield* PathModule.Path
    const skipListService = yield* NoInjectRefs

    return ReferencedContent.of({
      load: () =>
        Effect.gen(function*() {
          const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()

          const claudeMdPaths = [
            path.resolve(projectDir, 'CLAUDE.md'),
            path.resolve(projectDir, '.claude', 'CLAUDE.md'),
          ]

          const claudeContents = yield* Effect.all(
            claudeMdPaths.map((filePath) =>
              Effect.result(fs.readFileString(filePath, 'utf-8')).pipe(
                Effect.map((result) => ({ filePath, result })),
              )
            ),
            { concurrency: 'unbounded' },
          )

          const allRefs: Ref[] = []
          for (const { filePath, result } of claudeContents) {
            if (Result.isFailure(result)) continue
            const baseDir = path.dirname(filePath)
            for (const rawLine of result.success.split('\n')) {
              const ref = parseRefToken(rawLine, path)
              if (ref === null) continue

              const baseResolved = path.resolve(baseDir, ref)
              if (isConfined(baseResolved, projectDir)) {
                const baseExists = yield* Effect.result(fs.exists(baseResolved))
                if (Result.isSuccess(baseExists) && baseExists.success) {
                  allRefs.push({ sourcePath: baseDir, resolvedPath: baseResolved })
                  continue
                }
              }

              const rootResolved = path.resolve(projectDir, ref)
              if (isConfined(rootResolved, projectDir) && rootResolved !== baseResolved) {
                allRefs.push({ sourcePath: projectDir, resolvedPath: rootResolved })
              }
            }
          }

          let seenPaths = HashSet.empty<string>()
          const uniqueRefs: Ref[] = []
          for (const ref of allRefs) {
            if (!HashSet.has(seenPaths, ref.resolvedPath)) {
              seenPaths = HashSet.add(seenPaths, ref.resolvedPath)
              uniqueRefs.push(ref)
            }
          }

          const skipList = skipListService.get(projectDir)

          const entries = yield* Effect.all(
            uniqueRefs.map((ref) =>
              Effect.gen(function*() {
                const relativePath = ref.resolvedPath.slice(projectDir.length + 1)
                if (skipList.includes(relativePath)) return null
                const refContent = yield* Effect.result(fs.readFileString(ref.resolvedPath, 'utf-8'))
                if (Result.isFailure(refContent)) return null
                return [ref.resolvedPath, refContent.success] as const
              })
            ),
            { concurrency: 'unbounded' },
          )

          const refContents: Record<string, string> = {}
          for (const entry of entries) {
            if (entry !== null) refContents[entry[0]] = entry[1]
          }

          return buildInjectedContent(projectDir, uniqueRefs, refContents, skipList)
        }),
    })
  }),
)

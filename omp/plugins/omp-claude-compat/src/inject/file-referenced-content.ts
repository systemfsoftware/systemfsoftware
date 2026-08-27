import { Effect, Layer, Result } from 'effect'
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

          const allRefs: Ref[] = []
          for (const filePath of claudeMdPaths) {
            const content = yield* Effect.result(fs.readFileString(filePath, 'utf-8'))
            if (Result.isFailure(content)) continue
            const baseDir = path.dirname(filePath)
            for (const rawLine of content.success.split('\n')) {
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

          const seenPaths: string[] = []
          const uniqueRefs: Ref[] = []
          for (const ref of allRefs) {
            if (!seenPaths.includes(ref.resolvedPath)) {
              seenPaths.push(ref.resolvedPath)
              uniqueRefs.push(ref)
            }
          }

          const skipList = skipListService.get(projectDir)

          const refContents: Record<string, string> = {}
          for (const ref of uniqueRefs) {
            const relativePath = ref.resolvedPath.slice(projectDir.length + 1)
            if (skipList.includes(relativePath)) continue
            const refContent = yield* Effect.result(fs.readFileString(ref.resolvedPath, 'utf-8'))
            if (Result.isFailure(refContent)) continue
            refContents[ref.resolvedPath] = refContent.success
          }

          return buildInjectedContent(projectDir, uniqueRefs, refContents, skipList)
        }),
    })
  }),
)

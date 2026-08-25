import type { File } from '@systemfsoftware/stryker-js-instrumenter'
import type { FileDescription, MutateDescription } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

export interface ProjectFile extends FileDescription {
  readonly name: string
  readonly mutate: MutateDescription
  readonly content: string | undefined
  readonly originalContent: string | undefined
}

export function makeProjectFile(
  name: string,
  mutate: MutateDescription,
  content?: string,
  originalContent?: string,
): ProjectFile {
  return {
    name,
    mutate,
    content,
    originalContent,
  }
}

export function withContent(file: ProjectFile, content: string): ProjectFile {
  return { ...file, content }
}

export function withOriginalContent(file: ProjectFile, originalContent: string): ProjectFile {
  return { ...file, originalContent }
}

export function hasChanges(file: ProjectFile): boolean {
  return file.content !== undefined && file.content !== file.originalContent
}

function writeTo(
  file: ProjectFile,
  to: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> {
  if (file.content === undefined) {
    return Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      yield* fs.copyFile(file.name, to)
    })
  }
  const content = file.content
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(to, content)
  })
}

export function toInstrumenterFile(
  file: ProjectFile,
): Effect.Effect<File, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const content = yield* readContent(file)
    return {
      content,
      mutate: file.mutate,
      name: file.name,
    }
  })
}

export function readContent(
  file: ProjectFile,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    if (file.content !== undefined) {
      return file.content
    }
    if (file.originalContent !== undefined) {
      return file.originalContent
    }
    return yield* readOriginalContent(file)
  })
}

function readOriginalContent(
  file: ProjectFile,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    if (file.originalContent !== undefined) {
      return file.originalContent
    }
    const fs = yield* FileSystem.FileSystem
    const content = yield* fs.readFileString(file.name)
    return content
  })
}

export function readOriginal(
  file: ProjectFile,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> {
  return readOriginalContent(file)
}

export function writeInPlace(file: ProjectFile): Effect.Effect<void, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    if (file.content !== undefined && hasChanges(file)) {
      const fs = yield* FileSystem.FileSystem
      yield* fs.writeFileString(file.name, file.content)
    }
  })
}

export function writeToSandbox(
  file: ProjectFile,
  sandboxDir: string,
  basePath: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const relative = path.relative(basePath, file.name)
    const folderName = path.join(sandboxDir, path.dirname(relative))
    const targetFileName = path.join(folderName, path.basename(relative))
    yield* fs.makeDirectory(path.dirname(targetFileName), { recursive: true })
    yield* writeTo(file, targetFileName)
    return targetFileName
  })
}

export function backupTo(
  file: ProjectFile,
  backupDir: string,
  basePath: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const relative = path.relative(basePath, file.name)
    const backupFileName = path.join(backupDir, relative)
    yield* fs.makeDirectory(path.dirname(backupFileName), { recursive: true })
    if (file.originalContent === undefined) {
      yield* fs.copyFile(file.name, backupFileName)
    } else {
      yield* fs.writeFileString(backupFileName, file.originalContent)
    }
    return backupFileName
  })
}

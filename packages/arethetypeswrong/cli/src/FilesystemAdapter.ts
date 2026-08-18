import { Context, Effect, Layer } from 'effect'
import * as PlatformFs from 'effect/FileSystem'
import * as PlatformPathMod from 'effect/Path'

import { FileNotFoundError } from './Filesystem.schema.js'

export interface FilesystemService {
  readonly fileExists: (filePath: string) => Effect.Effect<boolean, never>
  readonly isDirectory: (filePath: string) => Effect.Effect<boolean, never>
  readonly readUtf8: (filePath: string) => Effect.Effect<string, FileNotFoundError>
  readonly readBytes: (filePath: string) => Effect.Effect<Uint8Array, FileNotFoundError>
  readonly deleteFile: (filePath: string) => Effect.Effect<void, never>
  readonly resolve: (...segments: readonly string[]) => string
  readonly join: (...segments: readonly string[]) => string
}

export class CliFilesystem extends Context.Service<CliFilesystem, FilesystemService>()(
  '@systemfsoftware/arethetypeswrong-cli/filesystem.adapter/Filesystem',
) {}

const fromPlatform = (
  fs: PlatformFs.FileSystem,
  path: PlatformPathMod.Path,
): FilesystemService => ({
  fileExists: (filePath) => fs.exists(filePath).pipe(Effect.orElseSucceed(() => false)),
  isDirectory: (filePath) =>
    fs.stat(filePath).pipe(
      Effect.map((s) => (s as { type: string }).type === 'directory'),
      Effect.orElseSucceed(() => false),
    ),
  readUtf8: (filePath) =>
    fs.readFileString(filePath).pipe(
      Effect.mapError(() => new FileNotFoundError({ filePath })),
    ),
  readBytes: (filePath) =>
    fs.readFile(filePath).pipe(
      Effect.mapError(() => new FileNotFoundError({ filePath })),
    ),
  deleteFile: (filePath) => fs.remove(filePath).pipe(Effect.orElseSucceed(() => undefined)),
  resolve: (...segments) => path.resolve(...segments),
  join: (...segments) => path.join(...segments),
})

export const FilesystemLive: Layer.Layer<CliFilesystem, never, PlatformFs.FileSystem | PlatformPathMod.Path> = Layer
  .effect(
    CliFilesystem,
    Effect.gen(function*() {
      const fs = yield* PlatformFs.FileSystem
      const path = yield* PlatformPathMod.Path
      return fromPlatform(fs, path)
    }),
  )

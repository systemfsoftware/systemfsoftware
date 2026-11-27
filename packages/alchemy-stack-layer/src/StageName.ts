import { Effect, FileSystem, Path } from 'effect'
import * as Digest from 'effect/crypto/Digest'

export interface FileStageInput {
  readonly baseStage: string
  readonly file: string
}

const SUFFIX_LENGTH = 8

const encoder = new TextEncoder()

export const fileSuffix = (repoRelativePath: string): Effect.Effect<string, never, Digest.Digest> =>
  Digest.Digest.use((digest) => digest.digestHex(Digest.sha256, encoder.encode(repoRelativePath))).pipe(
    Effect.map((hex) => hex.slice(0, SUFFIX_LENGTH)),
  )

type Ancestor = Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path>

const searchAbove = (directory: string): Ancestor =>
  Path.Path.use((path) => {
    const parent = path.dirname(directory)
    return parent === directory ? Effect.undefined : nearestGitAncestor(parent)
  })

const nearestGitAncestor = (directory: string): Ancestor =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const holdsGit = yield* fs.exists(path.join(directory, '.git')).pipe(Effect.orElseSucceed(() => false))
    return holdsGit ? directory : yield* searchAbove(directory)
  })

export const repoRelativePath = (file: string): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = (yield* nearestGitAncestor(path.dirname(file))) ?? path.resolve('.')
    return path.relative(root, file).split(path.sep).join('/')
  })

export const fileStage = (
  input: FileStageInput,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path | Digest.Digest> =>
  repoRelativePath(input.file).pipe(
    Effect.flatMap(fileSuffix),
    Effect.map((suffix) => `${input.baseStage}_${suffix}`),
  )

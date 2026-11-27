import type { TestFileInfo } from '@systemfsoftware/effect-spec-runtime'
import { Effect } from 'effect'
import * as Digest from 'effect/crypto/Digest'

export interface FileStageInput {
  readonly baseStage: string
  readonly testFile: TestFileInfo
}

const SUFFIX_LENGTH = 8

const encoder = new TextEncoder()

const identityOf = (testFile: TestFileInfo): string =>
  [testFile.projectName ?? '', testFile.rootName, testFile.name].join('\0')

const fileSuffix = (testFile: TestFileInfo): Effect.Effect<string, never, Digest.Digest> =>
  Digest.Digest.use((digest) => digest.digestHex(Digest.sha256, encoder.encode(identityOf(testFile)))).pipe(
    Effect.map((hex) => hex.slice(0, SUFFIX_LENGTH)),
  )

export const fileStage = (input: FileStageInput): Effect.Effect<string, never, Digest.Digest> =>
  Effect.map(fileSuffix(input.testFile), (suffix) => `${input.baseStage}_${suffix}`)

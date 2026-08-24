import { readFileSync } from 'fs'

import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import type { FileSystem, FileSystemEntries } from 'typescript/unstable/fs'

import { toPosixFileName } from '../posix-file-name.js'

import { HybridFileNotFoundError } from './hybrid-file-system.schema.js'
import { makeScriptFile, mutateScriptFile, resetScriptFile, type ScriptFile, withContent } from './script-file.js'

export interface HybridFileSystem {
  readonly fileSystem: FileSystem
  readonly getFile: (fileName: string) => Effect.Effect<ScriptFile | undefined>
  readonly writeFile: (fileName: string, data: string) => Effect.Effect<void>
  readonly mutateFile: (
    fileName: string,
    mutant: Pick<Mutant, 'location' | 'replacement'>,
  ) => Effect.Effect<void, HybridFileNotFoundError>
  readonly resetFile: (fileName: string) => Effect.Effect<void>
  readonly existsInMemory: (fileName: string) => Effect.Effect<boolean>
  readonly setTsConfigOverrides: (overrides: Map<string, string>) => Effect.Effect<void>
}

const makeEmptyFilesMap = (): Map<string, ScriptFile | undefined> => new Map()
const makeEmptyOverridesMap = (): Map<string, string> => new Map()

const copyAndSet = <K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> => {
  const next = new Map(map)
  next.set(key, value)
  return next
}

export const makeHybridFileSystem: Effect.Effect<HybridFileSystem> = Effect.gen(function*() {
  const filesRef = yield* Ref.make(makeEmptyFilesMap())
  const overridesRef = yield* Ref.make(makeEmptyOverridesMap())

  const fileNameIsBuildInfo = (fileName: string): boolean => fileName.endsWith('.tsbuildinfo')

  const fileSystem: FileSystem = {
    readFile: (fileName: string): string | null | undefined => {
      const normalized = toPosixFileName(fileName)
      if (fileNameIsBuildInfo(normalized)) {
        return null
      }
      const override = overridesRef.ref.current.get(normalized)
      if (override !== undefined) {
        return override
      }
      const files = filesRef.ref.current
      const file = files.get(normalized)
      if (file) {
        return file.content
      }
      if (file === undefined && files.has(normalized)) {
        return null
      }
      return undefined
    },

    fileExists: (fileName: string): boolean | undefined => {
      const normalized = toPosixFileName(fileName)
      if (fileNameIsBuildInfo(normalized)) {
        return false
      }
      if (overridesRef.ref.current.has(normalized)) {
        return true
      }
      const files = filesRef.ref.current
      if (files.has(normalized)) {
        return files.get(normalized) !== undefined
      }
      return undefined
    },

    directoryExists: (): boolean | undefined => undefined,

    getAccessibleEntries: (): FileSystemEntries | undefined => undefined,

    realpath: (): string | undefined => undefined,
  }
  const getFile = (fileName: string): Effect.Effect<ScriptFile | undefined> =>
    Effect.gen(function*() {
      const normalized = toPosixFileName(fileName)
      const files = yield* Ref.get(filesRef)
      if (files.has(normalized)) {
        return files.get(normalized)
      }
      const content = yield* Effect.try(() => readFileSync(normalized, 'utf-8')).pipe(
        Effect.orElseSucceed(() => undefined as string | undefined),
      )
      if (content === undefined) {
        yield* Ref.update(filesRef, (m) => copyAndSet(m, normalized, undefined))
        return undefined
      }
      const file = makeScriptFile(content, normalized)
      yield* Ref.update(filesRef, (m) => copyAndSet(m, normalized, file))
      return file
    })

  const writeFile = (fileName: string, data: string): Effect.Effect<void> =>
    Effect.gen(function*() {
      const normalized = toPosixFileName(fileName)
      const files = yield* Ref.get(filesRef)
      const existing = files.get(normalized)
      if (existing) {
        const next = withContent(existing, data)
        yield* Ref.update(filesRef, (m) => copyAndSet(m, normalized, next))
      } else {
        const file = makeScriptFile(data, normalized)
        yield* Ref.update(filesRef, (m) => copyAndSet(m, normalized, file))
      }
    })

  const mutateFile = (
    fileName: string,
    mutant: Pick<Mutant, 'location' | 'replacement'>,
  ): Effect.Effect<void, HybridFileNotFoundError> =>
    Effect.gen(function*() {
      const file = yield* getFile(fileName)
      if (!file) {
        return yield* new HybridFileNotFoundError({ fileName })
      }
      const next = mutateScriptFile(file, mutant)
      const normalized = toPosixFileName(fileName)
      yield* Ref.update(filesRef, (m) => copyAndSet(m, normalized, next))
    })

  const resetFile = (fileName: string): Effect.Effect<void> =>
    Effect.gen(function*() {
      const normalized = toPosixFileName(fileName)
      const files = yield* Ref.get(filesRef)
      const file = files.get(normalized)
      if (file) {
        const next = resetScriptFile(file)
        yield* Ref.update(filesRef, (m) => copyAndSet(m, normalized, next))
      }
    })

  const existsInMemory = (fileName: string): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      const files = yield* Ref.get(filesRef)
      const file = files.get(toPosixFileName(fileName))
      return file !== undefined
    })

  const setTsConfigOverrides = (overrides: Map<string, string>): Effect.Effect<void> => Ref.set(overridesRef, overrides)

  return {
    fileSystem,
    getFile,
    writeFile,
    mutateFile,
    resetFile,
    existsInMemory,
    setTsConfigOverrides,
  }
})

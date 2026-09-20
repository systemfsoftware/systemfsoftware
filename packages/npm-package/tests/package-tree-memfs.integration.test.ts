import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { type Contents, MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { type DirectoryJSON, toDirectoryJSON } from '@systemfsoftware/npm-package'
import { Effect, Schema } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })
const jsonString = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const volumeOf = (contents: DirectoryJSON): Contents => {
  const volume: Contents = {}
  Object.assign(volume, contents)
  return volume
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return ''
}

Feature('Package tree memfs projection — DirectoryJSON to MemoryFileSystem').body(({ scenario }) => {
  scenario(
    'Should_ReadPackageJson_When_MountedViaMemfs',
    Effect.gen(function*() {
      const pkgJson = jsonString({ name: 'demo', version: '1.0.0' })
      const tree = {
        'package.json': pkgJson,
        'index.d.ts': 'export declare const x: number',
      }
      const contents = toDirectoryJSON(tree, 'demo')

      expect(contents['/node_modules/demo/package.json']).toBe(pkgJson)

      const fs = MemoryFileSystem.make(volumeOf(contents))
      const bytes = yield* fs.readFile('/node_modules/demo/package.json')
      expect(new TextDecoder().decode(bytes)).toBe(pkgJson)
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'readFile failed', cause }))),
  )

  scenario(
    'Should_SurfacePlatformError_When_MissingPathIsRead',
    Effect.gen(function*() {
      const tree = {
        'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
        'index.js': 'export const x = 1',
      }
      const contents = toDirectoryJSON(tree, 'demo')
      expect(contents['/node_modules/demo/index.js']).toBe('export const x = 1')

      const fs = MemoryFileSystem.make(volumeOf(contents))
      const exited = yield* Effect.exit(fs.readFile('/node_modules/demo/missing.txt'))
      expect(exited._tag).toBe('Failure')
    }),
  )

  scenario(
    'Should_PreserveBytes_When_BinaryBodyIsMounted',
    Effect.gen(function*() {
      const binary = new Uint8Array([0, 1, 2, 255, 254, 253, 128, 64])
      const tree: Record<string, string | Uint8Array> = {
        'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
        'data.bin': binary,
      }
      const contents = toDirectoryJSON(tree, 'demo')
      const fs = MemoryFileSystem.make(volumeOf(contents))
      const bytes = yield* fs.readFile('/node_modules/demo/data.bin')
      expect(Array.from(bytes)).toEqual(Array.from(binary))
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'binary read failed', cause }))),
  )

  scenario(
    'Should_KeepAbsolutePrefix_When_AbsolutePathAlreadyUsesPrefix',
    Effect.sync(() => {
      const tree = {
        '/node_modules/demo/package.json': jsonString({ name: 'demo', version: '1.0.0' }),
        '/node_modules/demo/index.js': 'export const x = 1',
      }
      const contents = toDirectoryJSON(tree, 'demo')
      expect(contents['/node_modules/demo/index.js']).toBe('export const x = 1')
    }),
  )

  scenario(
    'Should_RejectAbsoluteOutsidePrefix_When_ProjectorReceivesOutsidePath',
    Effect.sync(() => {
      let sawThrow = false
      try {
        toDirectoryJSON(
          {
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            '/node_modules/other/index.js': 'export {}',
          },
          'demo',
        )
      } catch (error) {
        sawThrow = true
        expect(errorMessage(error)).toMatch(/Unexpected absolute fixture path/)
      }
      expect(sawThrow).toBe(true)
    }),
  )

  scenario(
    'Should_UseScopedPrefix_When_PackageNameIsScoped',
    Effect.gen(function*() {
      const tree = {
        'package.json': jsonString({ name: '@acme/pkg', version: '1.0.0' }),
        'index.js': 'export const x = 1',
      }
      const contents = toDirectoryJSON(tree, '@acme/pkg')
      expect(contents['/node_modules/@acme/pkg/package.json']).toBeDefined()

      const fs = MemoryFileSystem.make(volumeOf(contents))
      const bytes = yield* fs.readFile('/node_modules/@acme/pkg/package.json')
      expect(new TextDecoder().decode(bytes)).toContain('@acme/pkg')
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'scoped read failed', cause }))),
  )
})

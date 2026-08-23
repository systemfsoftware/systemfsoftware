import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { toDirectoryJSON } from '@systemfsoftware/npm-package'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Package tree memfs projection — DirectoryJSON to MemoryFileSystem').body(({ scenario }) => {
  scenario(
    'Should_ReadPackageJson_When_MountedViaMemfs',
    Effect.gen(function*() {
      const pkgJson = JSON.stringify({ name: 'demo', version: '1.0.0' })
      const tree = {
        'package.json': pkgJson,
        'index.d.ts': 'export declare const x: number',
      }
      const contents = toDirectoryJSON(tree, 'demo')

      expect(contents['/node_modules/demo/package.json']).toBe(pkgJson)

      const fs = MemoryFileSystem.make(contents as never)
      const bytes = yield* fs.readFile('/node_modules/demo/package.json')
      expect(new TextDecoder().decode(bytes)).toBe(pkgJson)
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'readFile failed', cause }))),
  )

  scenario(
    'Should_SurfacePlatformError_When_MissingPathIsRead',
    Effect.gen(function*() {
      const tree = {
        'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
        'index.js': 'export const x = 1',
      }
      const contents = toDirectoryJSON(tree, 'demo')
      expect(contents['/node_modules/demo/index.js']).toBe('export const x = 1')

      const fs = MemoryFileSystem.make(contents as never)
      const exited = yield* Effect.exit(fs.readFile('/node_modules/demo/missing.txt'))
      expect(exited._tag).toBe('Failure')
    }),
  )

  scenario(
    'Should_PreserveBytes_When_BinaryBodyIsMounted',
    Effect.gen(function*() {
      const binary = new Uint8Array([0, 1, 2, 255, 254, 253, 128, 64])
      const tree: Record<string, string | Uint8Array> = {
        'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
        'data.bin': binary,
      }
      const contents = toDirectoryJSON(tree, 'demo')
      const fs = MemoryFileSystem.make(contents as never)
      const bytes = yield* fs.readFile('/node_modules/demo/data.bin')
      expect(Array.from(bytes)).toEqual(Array.from(binary))
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'binary read failed', cause }))),
  )

  scenario(
    'Should_KeepAbsolutePrefix_When_AbsolutePathAlreadyUsesPrefix',
    Effect.sync(() => {
      const tree = {
        '/node_modules/demo/package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
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
            'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
            '/node_modules/other/index.js': 'export {}',
          },
          'demo',
        )
      } catch (error) {
        sawThrow = true
        const message = error instanceof Error ? error.message : ''
        expect(message).toMatch(/Unexpected absolute fixture path/)
      }
      expect(sawThrow).toBe(true)
    }),
  )

  scenario(
    'Should_UseScopedPrefix_When_PackageNameIsScoped',
    Effect.gen(function*() {
      const tree = {
        'package.json': JSON.stringify({ name: '@acme/pkg', version: '1.0.0' }),
        'index.js': 'export const x = 1',
      }
      const contents = toDirectoryJSON(tree, '@acme/pkg')
      expect(contents['/node_modules/@acme/pkg/package.json']).toBeDefined()

      const fs = MemoryFileSystem.make(contents as never)
      const bytes = yield* fs.readFile('/node_modules/@acme/pkg/package.json')
      expect(new TextDecoder().decode(bytes)).toContain('@acme/pkg')
    }).pipe(Effect.mapError((cause) => new StepError({ keyword: 'scenario', text: 'scoped read failed', cause }))),
  )
})

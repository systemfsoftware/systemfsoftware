import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type Contents, MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { type DirectoryJSON, toDirectoryJSON } from '@systemfsoftware/npm-package'
import { Effect, Exit, Layer } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })
const jsonString = <V = unknown>(value: V): string => JSON.stringify(value)

const volumeOf = (contents: DirectoryJSON): Contents => {
  const volume: Contents = {}
  Object.assign(volume, contents)
  return volume
}

Feature('Package tree memfs projection — DirectoryJSON to MemoryFileSystem')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A mounted package.json can be read back from memory filesystem',
      Gherkin.Do.pipe(
        Given('a package directory tree projected to memory filesystem records')('ctx', () => {
          const pkgJson = jsonString({ name: 'demo', version: '1.0.0' })
          const tree = {
            'package.json': pkgJson,
            'index.d.ts': 'export declare const x: number',
          }
          const contents = toDirectoryJSON(tree, 'demo')
          const fs = MemoryFileSystem.make(volumeOf(contents))
          return Effect.succeed({ fs, pkgJson })
        }),
        When('the package manifest is read from the memory filesystem')('content', (s) =>
          Effect.gen(function*() {
            const bytes = yield* s.ctx.fs.readFile('/node_modules/demo/package.json')
            return new TextDecoder().decode(bytes)
          })),
        Then('the read manifest matches the original JSON exactly')((s) => {
          expect(s.content).toBe(s.ctx.pkgJson)
        }),
      ),
    )

    scenario(
      'Reading a missing path surfaces a failure from the platform filesystem',
      Gherkin.Do.pipe(
        Given('an initialized memory filesystem without a requested optional path')('fs', () => {
          const tree = {
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            'index.js': 'export const x = 1',
          }
          const contents = toDirectoryJSON(tree, 'demo')
          return Effect.succeed(MemoryFileSystem.make(volumeOf(contents)))
        }),
        When('a non-existent file is read from the filesystem')(
          'exit',
          (s) => Effect.exit(s.fs.readFile('/node_modules/demo/missing.txt')),
        ),
        Then('the filesystem returns a Failure exit indicating missing path')((s) => {
          expect(Exit.isFailure(s.exit)).toBe(true)
        }),
      ),
    )

    scenario(
      'A binary body mounted as bytes is preserved without corruption',
      Gherkin.Do.pipe(
        Given('a package directory containing arbitrary binary bytes')('ctx', () => {
          const binary = new Uint8Array([0, 1, 2, 255, 254, 253, 128, 64])
          const tree: Record<string, string | Uint8Array> = {
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            'data.bin': binary,
          }
          const contents = toDirectoryJSON(tree, 'demo')
          const fs = MemoryFileSystem.make(volumeOf(contents))
          return Effect.succeed({ fs, binary })
        }),
        When('the binary file is read from the mounted filesystem')(
          'readBytes',
          (s) => s.ctx.fs.readFile('/node_modules/demo/data.bin'),
        ),
        Then('the read bytes are byte-identical to the original buffer')((s) => {
          expect(Array.from(s.readBytes)).toEqual(Array.from(s.ctx.binary))
        }),
      ),
    )

    scenario(
      'An absolute path that already carries the package prefix is kept intact',
      Gherkin.Do.pipe(
        Given('a directory mapping already prefixed with the node_modules package path')('tree', () =>
          Effect.succeed({
            '/node_modules/demo/package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            '/node_modules/demo/index.js': 'export const x = 1',
          })),
        When('the tree is projected into DirectoryJSON')(
          'contents',
          (s) => Effect.sync(() => toDirectoryJSON(s.tree, 'demo')),
        ),
        Then('the prefixed paths remain in place without double-prefixing')((s) => {
          expect(s.contents['/node_modules/demo/index.js']).toBe('export const x = 1')
          expect(s.contents['/node_modules/demo/package.json']).toBeDefined()
        }),
      ),
    )

    scenario(
      'Projector rejects an absolute path outside the destination prefix',
      Gherkin.Do.pipe(
        Given('a tree with an absolute path directed at another package')('tree', () =>
          Effect.succeed({
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            '/node_modules/other/index.js': 'export {}',
          })),
        When('the tree projection is attempted')('attempt', (s) =>
          Effect.sync(() => {
            try {
              toDirectoryJSON(s.tree, 'demo')
              return { threw: false, message: '' }
            } catch (err) {
              return { threw: true, message: err instanceof Error ? err.message : '' }
            }
          })),
        Then('the projection aborts with an unexpected fixture path error')((s) => {
          expect(s.attempt.threw).toBe(true)
          expect(s.attempt.message).toMatch(/Unexpected absolute fixture path/)
        }),
      ),
    )

    scenario(
      'A scoped package uses the scoped module directory prefix',
      Gherkin.Do.pipe(
        Given('a scoped package tree and its projected filesystem')('fs', () => {
          const tree = {
            'package.json': jsonString({ name: '@acme/pkg', version: '1.0.0' }),
            'index.js': 'export const x = 1',
          }
          const contents = toDirectoryJSON(tree, '@acme/pkg')
          return Effect.succeed(MemoryFileSystem.make(volumeOf(contents)))
        }),
        When('the scoped manifest is read through the nested scoped path')('text', (s) =>
          Effect.gen(function*() {
            const bytes = yield* s.fs.readFile('/node_modules/@acme/pkg/package.json')
            return new TextDecoder().decode(bytes)
          })),
        Then('the contents confirm the scoped package placement')((s) => {
          expect(s.text).toContain('@acme/pkg')
        }),
      ),
    )
  })

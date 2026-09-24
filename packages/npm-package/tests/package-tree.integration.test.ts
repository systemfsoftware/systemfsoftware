import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { createPackage } from '@systemfsoftware/npm-package'
import { Effect, Layer } from 'effect'

const Feature = makeFeature({ it })
const jsonString = <V = unknown>(value: V): string => JSON.stringify(value)

Feature('Package tree constructor — file-tree to Package projection (pure tree)')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An absolute path that already uses the package prefix is kept intact',
      Gherkin.Do.pipe(
        Given('a raw file map where an entry already carries the target package prefix')('tree', () =>
          Effect.succeed({
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            '/node_modules/demo/index.d.ts': 'export declare const x: number',
          })),
        When('the package instance is projected from the file tree')(
          'pkg',
          (s) => Effect.sync(() => createPackage(s.tree, 'demo', '1.0.0')),
        ),
        Then('the prefixed path is accessible and preserves its contents')((s, expect) =>
          expect({
            exists: s.pkg.fileExists('/node_modules/demo/index.d.ts'),
            content: s.pkg.readFile('/node_modules/demo/index.d.ts'),
          }).toEqual({ exists: true, content: 'export declare const x: number' })
        ),
      ),
    )

    scenario(
      'An absolute path outside the package prefix is refused',
      Gherkin.Do.pipe(
        Given('a file map containing an absolute path outside the target package scope')('tree', () =>
          Effect.succeed({
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            '/node_modules/other/index.d.ts': 'export {}',
          })),
        When('the constructor attempts to mount the misplaced file')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackage(s.tree, 'demo', '1.0.0')
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('the package constructor halts with an unexpected path error')((s, expect) =>
          expect(s.attempt).toMatchObject({
            message: 'Unexpected absolute fixture path: /node_modules/other/index.d.ts',
          })
        ),
      ),
    )

    scenario(
      'A tree missing package.json is refused by the constructor',
      Gherkin.Do.pipe(
        Given('a file map that omits the required package manifest')('tree', () =>
          Effect.succeed({
            'index.d.ts': 'export {}',
          })),
        When('the constructor attempts to initialize the package')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackage(s.tree, 'demo', '1.0.0')
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('initialization fails with a missing manifest error')((s, expect) =>
          expect(s.attempt).toMatchObject({ message: 'Must contain package.json' })
        ),
      ),
    )

    scenario(
      'A binary body written as Uint8Array round-trips intact',
      Gherkin.Do.pipe(
        Given('a package tree holding binary declaration bytes in a Uint8Array')('ctx', () => {
          const content = 'export declare const x: number'
          const bytes = new TextEncoder().encode(content)
          const tree = {
            'package.json': jsonString({ name: 'demo', version: '1.0.0' }),
            'index.d.ts': bytes,
          }
          return Effect.succeed({ content, tree })
        }),
        When('the package is constructed from the binary tree')(
          'pkg',
          (s) => Effect.sync(() => createPackage(s.ctx.tree, 'demo', '1.0.0')),
        ),
        Then('reading the file yields the decoded text identically')((s, expect) =>
          expect({
            content: s.pkg.readFile('/node_modules/demo/index.d.ts'),
            exists: s.pkg.fileExists('/node_modules/demo/index.d.ts'),
          }).toEqual({ content: s.ctx.content, exists: true })
        ),
      ),
    )

    scenario(
      'Constructor arguments take precedence when package.json disagrees',
      Gherkin.Do.pipe(
        Given('a package manifest with name and version differing from explicit arguments')(
          'tree',
          () =>
            Effect.succeed({
              'package.json': jsonString({ name: 'other', version: '9.9.9' }),
              'index.d.ts': 'export {}',
            }),
        ),
        When('the package is constructed with authoritative explicit arguments')(
          'pkg',
          (s) => Effect.sync(() => createPackage(s.tree, 'demo', '1.0.0')),
        ),
        Then('the explicit arguments govern identity and mounting location')((s, expect) =>
          expect({
            packageName: s.pkg.packageName,
            packageVersion: s.pkg.packageVersion,
            ownManifest: s.pkg.fileExists('/node_modules/demo/package.json'),
            foreignManifest: s.pkg.fileExists('/node_modules/other/package.json'),
          }).toEqual({ packageName: 'demo', packageVersion: '1.0.0', ownManifest: true, foreignManifest: false })
        ),
      ),
    )
  })

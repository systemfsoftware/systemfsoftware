import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { createPackage, createPackageFromTarballData, packPackage } from '@systemfsoftware/npm-package'
import { Effect, Layer } from 'effect'

const Feature = makeFeature({ it })
const jsonString = <V = unknown>(value: V): string => JSON.stringify(value)

const uint8Of = (value: string | Uint8Array | undefined): Uint8Array => {
  if (value instanceof Uint8Array) return value
  return new Uint8Array()
}

Feature('Tarball extract proof — pack then extract round-trips (AE5/AE8)')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Packed constructor tree extracts identical paths and bodies',
      Gherkin.Do.pipe(
        Given('a package created from in-memory sources with manifest, code, types, and readme')(
          'original',
          () =>
            Effect.sync(() =>
              createPackage(
                {
                  'package.json': jsonString({
                    name: 'extract-pack-test',
                    version: '1.0.0',
                    main: './dist/index.js',
                    types: './dist/index.d.ts',
                  }),
                  'dist/index.js': 'module.exports = { a: 1 };\n',
                  'dist/index.d.ts': 'export declare const a: number;\n',
                  'README.md': '# hello\n',
                },
                'extract-pack-test',
                '1.0.0',
              )
            ),
        ),
        When('the package is packed to a tarball and extracted into a new package instance')(
          'extracted',
          (s) =>
            Effect.sync(() => {
              const tarball = packPackage(s.original)
              return createPackageFromTarballData(tarball)
            }),
        ),
        Then('all metadata, file lists, and file contents match identically')((s, expect) => {
          const files = [
            '/node_modules/extract-pack-test/README.md',
            '/node_modules/extract-pack-test/dist/index.d.ts',
            '/node_modules/extract-pack-test/dist/index.js',
            '/node_modules/extract-pack-test/package.json',
          ]
          return expect({
            packageName: s.extracted.packageName,
            packageVersion: s.extracted.packageVersion,
            files: s.extracted.listFiles('/').sort(),
            contents: files.map((path) => s.extracted.tryReadFile(path)),
          }).toEqual({
            packageName: 'extract-pack-test',
            packageVersion: '1.0.0',
            files,
            contents: [
              '# hello\n',
              'export declare const a: number;\n',
              'module.exports = { a: 1 };\n',
              jsonString({
                name: 'extract-pack-test',
                version: '1.0.0',
                main: './dist/index.js',
                types: './dist/index.d.ts',
              }),
            ],
          })
        }),
      ),
    )

    scenario(
      'Binary bytes are preserved exactly when packed and extracted',
      Gherkin.Do.pipe(
        Given('a package with a raw binary asset')('ctx', () => {
          const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0x81])
          const original = createPackage(
            {
              'package.json': jsonString({ name: 'bin-test', version: '1.0.0' }),
              'asset.bin': binary,
            },
            'bin-test',
            '1.0.0',
          )
          return Effect.succeed({ original, binary })
        }),
        When('the package is packed into tarball and extracted')('readBytes', (s) =>
          Effect.sync(() => {
            const extracted = createPackageFromTarballData(packPackage(s.ctx.original))
            return extracted.tryReadBytes('/node_modules/bin-test/asset.bin')
          })),
        Then('the extracted binary bytes match the original buffer bit-for-bit')((s, expect) =>
          expect(Array.from(uint8Of(s.readBytes))).toEqual(Array.from(s.ctx.binary))
        ),
      ),
    )

    scenario(
      'Extraction fails when gzip bytes only contain a zero-padded header',
      Gherkin.Do.pipe(
        Given('a zero-padded byte array with no valid gzip payload')('bytes', () => Effect.succeed(new Uint8Array(32))),
        When('extraction is attempted on the invalid stream')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackageFromTarballData(s.bytes)
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('the extractor rejects the corrupt payload')((s, expect) =>
          expect(s.attempt).toMatchObject({ message: 'Tarball is empty' })
        ),
      ),
    )

    scenario(
      'Extraction fails when gzip bytes are a truncated header',
      Gherkin.Do.pipe(
        Given('a truncated gzip header containing only magic bytes')(
          'bytes',
          () => Effect.succeed(Uint8Array.from([0x1f, 0x8b, 0x08, 0x00])),
        ),
        When('extraction is attempted on the truncated header')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackageFromTarballData(s.bytes)
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('the extractor rejects the truncated stream')((s, expect) =>
          expect(s.attempt).toMatchObject({ message: 'Tarball is empty' })
        ),
      ),
    )

    scenario(
      'Extraction fails when payload bytes are not gzip at all',
      Gherkin.Do.pipe(
        Given('arbitrary non-gzip text bytes')(
          'bytes',
          () => Effect.succeed(new TextEncoder().encode('not a gzip file at all')),
        ),
        When('extraction is attempted on the non-archive bytes')('attempt', (s) =>
          Effect.sync(() => {
            try {
              createPackageFromTarballData(s.bytes)
              return { message: undefined }
            } catch (err) {
              return { message: err instanceof Error ? err.message : undefined }
            }
          })),
        Then('the extractor rejects the uncompressed text stream')((s, expect) =>
          expect(s.attempt).toMatchObject({ message: 'Tarball is empty' })
        ),
      ),
    )
  })

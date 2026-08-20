import { untar } from '@andrewbranch/untar.js'
import { Context, Effect, Layer } from 'effect'
import { FlateErrorCode, Gunzip } from 'fflate'
import ts from 'typescript'

function parsePackageJson(text: string): { name: string; version: string } {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null) {
    throw new TarballAdapterError('Tarball package.json is not an object')
  }
  if (!('name' in value) || typeof value.name !== 'string') {
    throw new TarballAdapterError('Tarball package.json is missing a name')
  }
  if (!('version' in value) || typeof value.version !== 'string') {
    throw new TarballAdapterError('Tarball package.json is missing a version')
  }
  return { name: value.name, version: value.version }
}

export interface TarballFile {
  readonly path: string
  readonly content: Uint8Array
}

export interface ExtractedTarball {
  readonly packageName: string
  readonly packageVersion: string
  readonly files: readonly TarballFile[]
}

export class TarballAdapterError extends Error {}

export interface TarballAdapterService {
  readonly extract: (tarball: Uint8Array) => Effect.Effect<ExtractedTarball, TarballAdapterError>
}

export class TarballAdapter extends Context.Service<TarballAdapter, TarballAdapterService>()(
  '@systemfsoftware/arethetypeswrong-core/TarballAdapter',
) {}

export const TarballAdapterLive: Layer.Layer<TarballAdapter, never, never> = Layer.succeed(
  TarballAdapter,
  {
    extract: (tarball) =>
      Effect.try({
        try: () => extractTarball(tarball),
        catch: (e) =>
          e instanceof TarballAdapterError
            ? e
            : new TarballAdapterError('Failed to extract tarball', { cause: e }),
      }),
  },
)

export const TarballAdapterStub = (
  files: readonly TarballFile[],
): Layer.Layer<TarballAdapter, never, never> =>
  Layer.succeed(TarballAdapter, {
    extract: () =>
      Effect.succeed({
        packageName: 'stub-package',
        packageVersion: '0.0.0',
        files,
      }),
  })

function extractTarball(tarball: Uint8Array): ExtractedTarball {
  const chunks: Uint8Array[] = []
  try {
    new Gunzip((chunk: Uint8Array) => chunks.push(chunk)).push(tarball, true)
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code !== FlateErrorCode.InvalidHeader) {
      throw err
    }
  }
  const unzipped = new Uint8Array(chunks.reduce((acc, b) => acc + b.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    unzipped.set(chunk, offset)
    offset += chunk.length
  }
  const data = untar(unzipped.buffer)
  const prefix = data[0].filename.substring(0, data[0].filename.indexOf('/') + 1)
  const packageJsonText = data.find((f) => f.filename === `${prefix}package.json`)?.fileData
  if (packageJsonText === undefined) {
    throw new TarballAdapterError(`Tarball is missing ${prefix}package.json`)
  }
  const packageJson = parsePackageJson(new TextDecoder().decode(packageJsonText))
  const packageName = packageJson.name
  const packageVersion = packageJson.version
  const files: TarballFile[] = []
  for (const file of data) {
    if (file.filename === `${prefix}package.json`) continue
    const path = ts.combinePaths('/node_modules/' + packageName, file.filename.substring(prefix.length))
    files.push({ path, content: file.fileData })
  }
  return { packageName, packageVersion, files }
}

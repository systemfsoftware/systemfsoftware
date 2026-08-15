import { untar } from '@andrewbranch/untar.js'
import { Context, Effect, Layer } from 'effect'
import { FlateErrorCode, Gunzip } from 'fflate'
import ts from 'typescript'

export interface TarballFile {
  readonly path: string
  readonly content: Uint8Array
}

export interface ExtractedTarball {
  readonly packageName: string
  readonly packageVersion: string
  readonly files: readonly TarballFile[]
}

export class TarballAdapterError extends Error {
  readonly _tag = 'TarballAdapterError'
}

export interface TarballAdapterService {
  readonly extract: (tarball: Uint8Array) => Effect.Effect<ExtractedTarball, TarballAdapterError>
}

export class TarballAdapter extends Context.Tag(
  '@systemfsoftware/arethetypeswrong-core/TarballAdapter',
)<TarballAdapter, TarballAdapterService>() {}

export const TarballAdapterLive: Layer.Layer<TarballAdapter, never, never> = Layer.succeed(
  TarballAdapter,
  {
    extract: (tarball) =>
      Effect.try({
        try: () => extractTarball(tarball),
        catch: (e) =>
          e instanceof TarballAdapterError
            ? e
            : new TarballAdapterError(`Failed to extract tarball: ${String(e)}`),
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
    const e = err as { code?: number }
    if (e.code !== FlateErrorCode.InvalidHeader) {
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
  const packageJson = JSON.parse(new TextDecoder().decode(packageJsonText)) as {
    name: string
    version: string
  }
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

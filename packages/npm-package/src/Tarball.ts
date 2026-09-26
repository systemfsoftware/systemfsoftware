import { untar } from '@andrewbranch/untar.js'
import { Match, Option, Schema } from 'effect'
import { absurd, identity } from 'effect/Function'
import * as Result from 'effect/Result'
import { type FlateError, Gunzip } from 'fflate'
import { ClassifyGzipFailure, classifyGzipFailure, type GzipFailureDecision } from './classify-gzip-failure.workflow.js'
import { combinePaths } from './Path.js'
import { TarballPackageJsonSchema } from './Tarball.schema.js'

export interface ExtractedTarball {
  files: Record<string, Uint8Array>
  packageName: string
  packageVersion: string
}

const decodeManifest = Schema.decodeUnknownOption(Schema.fromJsonString(TarballPackageJsonSchema))

function isObject(value: unknown): value is object {
  if (typeof value !== 'object') return false
  return value !== null
}

function hasNumericCode(error: object): boolean {
  if (!('code' in error)) return false
  return typeof error.code === 'number'
}

function isGzipFailure(error: unknown): error is FlateError {
  if (!isObject(error)) return false
  return hasNumericCode(error)
}

function throwIfGzipDamaged(err: unknown): asserts err is FlateError {
  const classified: GzipFailureDecision = Result.match(
    classifyGzipFailure(new ClassifyGzipFailure({ code: isGzipFailure(err) ? err.code : null })),
    {
      onFailure: (unreachable): GzipFailureDecision => absurd(unreachable),
      onSuccess: identity,
    },
  )
  Match.value(classified).pipe(
    Match.tag('NotGzipHeader', () => undefined),
    Match.tag('DamagedGzipStream', () => {
      throw err
    }),
    Match.exhaustive,
  )
}

function decompress(tarball: Uint8Array, chunks: Uint8Array[]): void {
  try {
    new Gunzip((chunk) => chunks.push(chunk)).push(tarball, true)
  } catch (err: unknown) {
    throwIfGzipDamaged(err)
  }
}

function gunzipChunks(tarball: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = []
  decompress(tarball, chunks)
  return chunks
}

function copyChunk(unzipped: Uint8Array, chunk: Uint8Array, offset: number): number {
  unzipped.set(chunk, offset)
  return offset + chunk.length
}

function copyChunks(unzipped: Uint8Array, chunks: Uint8Array[]): void {
  let offset = 0
  for (const chunk of chunks) {
    offset = copyChunk(unzipped, chunk, offset)
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const unzipped = new Uint8Array(chunks.reduce((acc, b) => acc + b.length, 0))
  copyChunks(unzipped, chunks)
  return unzipped
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

interface TarFile {
  filename: string
  fileData: Uint8Array
}

function requireFirstEntry(data: readonly TarFile[]): TarFile {
  const first = data[0]
  if (first === undefined) {
    throw new Error('Tarball is empty')
  }
  return first
}

function requirePackageJson(data: readonly TarFile[], prefix: string): TarFile {
  const packageJsonFile = data.find((f) => f.filename === `${prefix}package.json`)
  if (packageJsonFile === undefined) {
    throw new Error(`Package tarball does not contain ${prefix}package.json`)
  }
  return packageJsonFile
}

function decodePackageJson(packageJsonText: string, prefix: string): { name: string; version: string } {
  const decoded = decodeManifest(packageJsonText)
  if (Option.isNone(decoded)) {
    throw new Error(`Invalid package.json in ${prefix}package.json: ${packageJsonText}`)
  }
  return decoded.value
}

function filesFromTar(data: readonly TarFile[], packageName: string, prefix: string): Record<string, Uint8Array> {
  return data.reduce((acc: Record<string, Uint8Array>, file) => {
    acc[combinePaths(`/node_modules/${packageName}`, file.filename.substring(prefix.length))] = file.fileData
    return acc
  }, {})
}

export function extractTarball(tarball: Uint8Array): ExtractedTarball {
  // Use streaming API to work around https://github.com/101arrowz/fflate/issues/207
  const data: readonly TarFile[] = untar(toArrayBuffer(concatChunks(gunzipChunks(tarball))))
  const first = requireFirstEntry(data)
  const prefix = first.filename.substring(0, first.filename.indexOf('/') + 1)
  const packageJsonFile = requirePackageJson(data, prefix)
  const packageJsonText = new TextDecoder().decode(packageJsonFile.fileData)
  const { name: packageName, version: packageVersion } = decodePackageJson(packageJsonText, prefix)
  return { files: filesFromTar(data, packageName, prefix), packageName, packageVersion }
}

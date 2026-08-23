import { untar } from '@andrewbranch/untar.js'
import { Option, Schema } from 'effect'
import { type FlateError, FlateErrorCode, Gunzip } from 'fflate'
import { combinePaths } from './Path.js'
import { TarballPackageJsonSchema } from './Tarball.schema.js'

export interface ExtractedTarball {
  files: Record<string, Uint8Array>
  packageName: string
  packageVersion: string
}

const decodeManifest = Schema.decodeUnknownOption(TarballPackageJsonSchema)

function isInvalidHeaderError(error: unknown): error is FlateError {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  return Reflect.get(error, 'code') === FlateErrorCode.InvalidHeader
}

export function extractTarball(tarball: Uint8Array): ExtractedTarball {
  // Use streaming API to work around https://github.com/101arrowz/fflate/issues/207
  const chunks: Uint8Array[] = []
  try {
    new Gunzip((chunk) => chunks.push(chunk)).push(tarball, true)
  } catch (err) {
    // this happens for zero-padded tarballs; can safely ignore
    if (!isInvalidHeaderError(err)) {
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
  const first = data[0]
  if (first === undefined) {
    throw new Error('Tarball is empty')
  }
  const prefix = first.filename.substring(0, first.filename.indexOf('/') + 1)
  const packageJsonFile = data.find((f) => f.filename === `${prefix}package.json`)
  if (packageJsonFile === undefined) {
    throw new Error(`Package tarball does not contain ${prefix}package.json`)
  }
  const packageJsonText = new TextDecoder().decode(packageJsonFile.fileData)
  const decoded = decodeManifest(JSON.parse(packageJsonText))
  if (Option.isNone(decoded)) {
    throw new Error(`Invalid package.json in ${prefix}package.json: ${packageJsonText}`)
  }
  const { name: packageName, version: packageVersion } = decoded.value
  const files = data.reduce((acc: Record<string, Uint8Array>, file) => {
    acc[combinePaths(`/node_modules/${packageName}`, file.filename.substring(prefix.length))] = file.fileData
    return acc
  }, {})
  return { files, packageName, packageVersion }
}

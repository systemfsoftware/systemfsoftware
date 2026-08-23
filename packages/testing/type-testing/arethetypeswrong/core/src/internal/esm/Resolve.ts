import * as cjs from '@loaderkit/resolve/cjs'
import * as esm from '@loaderkit/resolve/esm'
import type { FileSystemSync } from '@loaderkit/resolve/fs'
import type { Package } from '../../CreatePackage.js'

function makeFileSystemAdapter(fs: Package): FileSystemSync {
  return {
    directoryExists: url => fs.directoryExists(url.pathname),
    fileExists: url => fs.fileExists(url.pathname),
    readFileJSON: (url) => {
      const parsed: unknown = JSON.parse(fs.readFile(url.pathname))
      return parsed
    },
    readLink: () => undefined,
  }
}

/** @internal */
export function cjsResolve(fs: Package, specifier: string, parentURL: URL) {
  return cjs.resolveSync(makeFileSystemAdapter(fs), specifier, parentURL)
}

/** @internal */
export function esmResolve(fs: Package, specifier: string, parentURL: URL) {
  return esm.resolveSync(makeFileSystemAdapter(fs), specifier, parentURL)
}

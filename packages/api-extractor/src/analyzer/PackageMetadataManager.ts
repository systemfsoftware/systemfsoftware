import type { Schema } from 'effect'
import * as Pipeable from 'effect/Pipeable'
import * as ts from 'typescript'
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from './path-helpers.js'

import * as semver from 'semver'

import { type INodePackageJson, PackageJsonLookup } from './package-json-lookup.js'

import { ConsoleMessageId, type MessageLog } from '../collector/message-log.js'

/*
 * Represents analyzed information for a package.json file.
 * This object is constructed and returned by PackageMetadataManager.
 */
export class PackageMetadata extends Pipeable.Class {
  /*
   * The absolute path to the package.json file being analyzed.
   */
  public readonly packageJsonPath: string
  /*
   * The parsed contents of package.json.  Note that PackageJsonLookup
   * only includes essential fields.
   */
  public readonly packageJson: INodePackageJson
  /*
   * If true, then the package's documentation comments can be assumed
   * to contain API Extractor compatible TSDoc tags.
   */
  public readonly aedocSupported: boolean

  public constructor(packageJsonPath: string, packageJson: INodePackageJson, aedocSupported: boolean) {
    super()
    this.packageJsonPath = packageJsonPath
    this.packageJson = packageJson
    this.aedocSupported = aedocSupported
  }
}

const TSDOC_METADATA_FILENAME = 'tsdoc-metadata.json' as const

/*
 * 1. If package.json a `"tsdocMetadata": "./path1/path2/tsdoc-metadata.json"` field
 * then that takes precedence. This convention will be rarely needed, since the other rules below generally
 * produce a good result.
 */
function _tryResolveTsdocMetadataFromTsdocMetadataField({
  tsdocMetadata,
}: INodePackageJson): string | undefined {
  return tsdocMetadata
}

/*
 * 2. If package.json contains a `"exports": { ".": { "types": "./path1/path2/index.d.ts" } }` field,
 * then we look for the file under "./path1/path2/tsdoc-metadata.json"
 *
 * This always looks for a "." and then a "*" entry in the exports field, and then evaluates for
 * a "types" field in that entry.
 */

type JsonRecordValue = { [key: string]: Schema.Json }

const isJsonRecord = (value: Schema.Json | undefined): value is JsonRecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const pathEntryOf = (entry: Schema.Json | undefined): readonly string[] | undefined => {
  if (typeof entry === 'string') {
    return [entry]
  }
  if (Array.isArray(entry)) {
    return entry.filter((item): item is string => typeof item === 'string')
  }
  return undefined
}

const typesExportFolderPath = (typesExport: Schema.Json | undefined): string | undefined => {
  if (typeof typesExport === 'string') {
    return `${path.dirname(typesExport)}/${TSDOC_METADATA_FILENAME}`
  }
  if (isJsonRecord(typesExport)) {
    return typesExportFolderPath(typesExport['types'])
  }
  return undefined
}

function _tryResolveTsdocMetadataFromExportsField({ exports }: INodePackageJson): string | undefined {
  if (typeof exports === 'string') {
    return `${path.dirname(exports)}/${TSDOC_METADATA_FILENAME}`
  }
  if (Array.isArray(exports)) {
    const firstExport = exports[0]
    if (typeof firstExport === 'string') {
      return `${path.dirname(firstExport)}/${TSDOC_METADATA_FILENAME}`
    }
    return undefined
  }
  if (isJsonRecord(exports)) {
    const rootExport = exports['.'] ?? exports['*']
    if (typeof rootExport === 'string') {
      return `${path.dirname(rootExport)}/${TSDOC_METADATA_FILENAME}`
    }
    if (isJsonRecord(rootExport)) {
      return typesExportFolderPath(rootExport['types'])
    }
  }
  return undefined
}

/*
 * 3. If package.json contains a `typesVersions` field, look for the version
 * matching the highest minimum version that either includes a "." or "*" entry.
 */
function _tryResolveTsdocMetadataFromTypesVersionsField({
  typesVersions,
}: INodePackageJson): string | undefined {
  if (!isJsonRecord(typesVersions)) {
    return undefined
  }
  let highestMinimumMatchingSemver: semver.SemVer | undefined
  let latestMatchingPath: string | undefined
  for (const [version, paths] of Object.entries(typesVersions)) {
    let range: semver.Range
    try {
      range = new semver.Range(version)
    } catch {
      continue
    }

    const minimumMatchingSemver: semver.SemVer | null = semver.minVersion(range)
    if (
      minimumMatchingSemver &&
      (!highestMinimumMatchingSemver || semver.gt(minimumMatchingSemver, highestMinimumMatchingSemver))
    ) {
      let pathEntry: readonly string[] | undefined
      if (Array.isArray(paths)) {
        pathEntry = paths.filter((entry): entry is string => typeof entry === 'string')
      } else if (typeof paths === 'string') {
        // typesVersions map entry may be a bare path string: { "4": { "types": "..." } } or "lib"
        pathEntry = [paths]
      } else if (isJsonRecord(paths)) {
        // A typesVersions sub-record such as { ".": ["lib/types.d.ts"] }.
        const record = new Map(Object.entries(paths))
        pathEntry = pathEntryOf(record.get('.') ?? record.get('*'))
      } else {
        pathEntry = undefined
      }
      const firstPath: string | undefined = pathEntry?.[0]
      if (firstPath) {
        highestMinimumMatchingSemver = minimumMatchingSemver
        latestMatchingPath = firstPath
      }
    }
  }

  if (latestMatchingPath) {
    return `${path.dirname(latestMatchingPath)}/${TSDOC_METADATA_FILENAME}`
  }
  return undefined
}
/*
 * 4. If package.json contains a `"types": "./path1/path2/index.d.ts"` or a `"typings": "./path1/path2/index.d.ts"`
 * field, then we look for the file under "./path1/path2/tsdoc-metadata.json".
 *
 * @remarks
 * `types` takes precedence over `typings`.
 */
function _tryResolveTsdocMetadataFromTypesOrTypingsFields({
  typings,
  types,
}: INodePackageJson): string | undefined {
  const typesField: string | undefined = types ?? typings
  if (typesField) {
    return `${path.dirname(typesField)}/${TSDOC_METADATA_FILENAME}`
  }
  return undefined
}

/*
 * 5. If package.json contains a `"main": "./path1/path2/index.js"` field, then we look for the file under
 * "./path1/path2/tsdoc-metadata.json".
 */
function _tryResolveTsdocMetadataFromMainField({ main }: INodePackageJson): string | undefined {
  if (main) {
    return `${path.dirname(main)}/${TSDOC_METADATA_FILENAME}`
  }
  return undefined
}

/*
 * This feature is still being standardized: https://github.com/microsoft/tsdoc/issues/7
 * In the future we will use the @microsoft/tsdoc library to read this file.
 */
function _resolveTsdocMetadataPathFromPackageJson(
  packageFolder: string,
  packageJson: INodePackageJson,
): string {
  const tsdocMetadataRelativePath: string = _tryResolveTsdocMetadataFromTsdocMetadataField(packageJson) ??
    _tryResolveTsdocMetadataFromExportsField(packageJson) ??
    _tryResolveTsdocMetadataFromTypesVersionsField(packageJson) ??
    _tryResolveTsdocMetadataFromTypesOrTypingsFields(packageJson) ??
    _tryResolveTsdocMetadataFromMainField(packageJson) ??
    // As a final fallback, place the file in the root of the package.
    TSDOC_METADATA_FILENAME

  // Always resolve relative to the package folder.
  const tsdocMetadataPath: string = path.resolve(
    packageFolder,
    // This non-null assertion is safe because the last entry in TSDOC_METADATA_RESOLUTION_FUNCTIONS
    // returns a non-undefined value.
    tsdocMetadataRelativePath!,
  )
  return tsdocMetadataPath
}

/*
 * This class maintains a cache of analyzed information obtained from package.json
 * files.  It is built on top of the PackageJsonLookup class.
 *
 * @remarks
 *
 * IMPORTANT: Don't use PackageMetadataManager to analyze source files from the current project:
 * 1. Files such as tsdoc-metadata.json may not have been built yet, and thus may contain incorrect information.
 * 2. The current project is not guaranteed to have a package.json file at all.  For example, API Extractor can
 *    be invoked on a bare .d.ts file.
 *
 * Use ts.program.isSourceFileFromExternalLibrary() to test source files before passing the to PackageMetadataManager.
 */
export class PackageMetadataManager extends Pipeable.Class {
  public static tsdocMetadataFilename: string = TSDOC_METADATA_FILENAME

  readonly #packageJsonLookup: PackageJsonLookup
  readonly #messageLog: MessageLog
  readonly #packageMetadataByPackageJsonPath: Map<string, PackageMetadata> = new Map<
    string,
    PackageMetadata
  >()

  public constructor(packageJsonLookup: PackageJsonLookup, messageLog: MessageLog) {
    super()
    this.#packageJsonLookup = packageJsonLookup
    this.#messageLog = messageLog
  }

  /*
   * @param tsdocMetadataPath - An explicit path that can be configured in api-extractor.json.
   * If this parameter is not an empty string, it overrides the normal path calculation.
   * @returns the absolute path to the TSDoc metadata file
   */
  public static resolveTsdocMetadataPath(
    packageFolder: string,
    packageJson: INodePackageJson,
    tsdocMetadataPath?: string,
  ): string {
    if (tsdocMetadataPath) {
      return path.resolve(packageFolder, tsdocMetadataPath)
    }

    return _resolveTsdocMetadataPathFromPackageJson(packageFolder, packageJson)
  }

  /*
   * Finds the package.json in a parent folder of the specified source file, and
   * returns a PackageMetadata object.  If no package.json was found, then undefined
   * is returned.  The results are cached.
   */
  public tryFetchPackageMetadata(sourceFilePath: string): PackageMetadata | undefined {
    const packageJsonFilePath: string | undefined = this.#packageJsonLookup.tryGetPackageJsonFilePathFor(sourceFilePath)
    if (!packageJsonFilePath) {
      return undefined
    }
    let packageMetadata: PackageMetadata | undefined = this.#packageMetadataByPackageJsonPath.get(packageJsonFilePath)

    if (!packageMetadata) {
      const packageJson: INodePackageJson = this.#packageJsonLookup.loadNodePackageJson(packageJsonFilePath)

      const packageJsonFolder: string = path.dirname(packageJsonFilePath)

      let aedocSupported: boolean = false

      const tsdocMetadataPath: string = _resolveTsdocMetadataPathFromPackageJson(
        packageJsonFolder,
        packageJson,
      )

      if (ts.sys.fileExists(tsdocMetadataPath)) {
        this.#messageLog.addConsoleMessage(
          ConsoleMessageId.FoundTSDocMetadata,
          'verbose',
          'Found metadata in ' + tsdocMetadataPath,
        )
        aedocSupported = true
      }

      packageMetadata = new PackageMetadata(packageJsonFilePath, packageJson, aedocSupported)
      this.#packageMetadataByPackageJsonPath.set(packageJsonFilePath, packageMetadata)
    }

    return packageMetadata
  }

  /*
   * Returns true if the source file is part of a package whose .d.ts files support AEDoc annotations.
   */
  public isAedocSupportedFor(sourceFilePath: string): boolean {
    const packageMetadata: PackageMetadata | undefined = this.tryFetchPackageMetadata(sourceFilePath)
    if (!packageMetadata) {
      return false
    }
    return packageMetadata.aedocSupported
  }
}

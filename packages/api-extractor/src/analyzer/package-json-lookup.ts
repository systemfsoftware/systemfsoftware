import { Schema } from 'effect'
import * as Effect from 'effect/Effect'
import * as Pipeable from 'effect/Pipeable'
import * as ts from 'typescript'
import type { JsonRecord } from '../config/json-record.schema.js'
import { JsonRecordFromString } from '../config/json-record.schema.js'
import { InternalInvariantError } from '../errors/index.js'

export interface INodePackageJson {
  readonly name?: string | undefined
  readonly version?: string | undefined
  readonly main?: string | undefined
  readonly types?: string | undefined
  readonly typings?: string | undefined
  readonly tsdocMetadata?: string | undefined
  readonly exports?: Schema.Json | undefined
  readonly typesVersions?: Readonly<Record<string, readonly string[]>> | undefined
  readonly dependencies?: Readonly<Record<string, string>> | undefined
  readonly devDependencies?: Readonly<Record<string, string>> | undefined
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined
  readonly optionalDependencies?: Readonly<Record<string, string>> | undefined
}

export interface PackageJsonLookupOptions {
  readonly fileExists?: (filePath: string) => boolean
  readonly readFile?: (filePath: string) => string
}

const readOptionalString = (record: JsonRecord, key: string): string | undefined => {
  const val = record[key]
  return typeof val === 'string' ? val : undefined
}

export class PackageJsonLookup extends Pipeable.Class {
  readonly #cache = new Map<string, INodePackageJson>()
  readonly #pkgJsonPathCache = new Map<string, string | undefined>()
  readonly #fileExists: (filePath: string) => boolean
  readonly #readFile: (filePath: string) => string

  public constructor(options?: PackageJsonLookupOptions) {
    super()
    this.#fileExists = options?.fileExists ?? ((p) => ts.sys.fileExists(p))
    this.#readFile = options?.readFile ?? ((p) => ts.sys.readFile(p) ?? '')
  }

  public tryGetPackageFolderFor(fileOrFolderPath: string): string | undefined {
    let current = fileOrFolderPath.replace(/\\/g, '/')
    if (this.#pkgJsonPathCache.has(current)) {
      return this.#pkgJsonPathCache.get(current)
    }

    while (current.length > 0 && current !== '.' && current !== '/') {
      const candidate = `${current}/package.json`
      if (this.#fileExists(candidate)) {
        this.#pkgJsonPathCache.set(fileOrFolderPath, current)
        return current
      }
      const slash = current.lastIndexOf('/')
      if (slash <= 0) {
        break
      }
      current = current.substring(0, slash)
    }

    this.#pkgJsonPathCache.set(fileOrFolderPath, undefined)
    return undefined
  }

  public tryGetPackageJsonFilePathFor(fileOrFolderPath: string): string | undefined {
    const folder = this.tryGetPackageFolderFor(fileOrFolderPath)
    return folder === undefined ? undefined : `${folder}/package.json`
  }

  public loadNodePackageJson(packageJsonFilePath: string): INodePackageJson {
    const normalized = packageJsonFilePath.replace(/\\/g, '/')
    const cached = this.#cache.get(normalized)
    if (cached !== undefined) {
      return cached
    }

    const content = this.#readFile(normalized)
    if (content === '') {
      throw new InternalInvariantError({ message: `Input file not found: ${packageJsonFilePath}` })
    }

    const raw: JsonRecord = Effect.runSync(Schema.decodeEffect(JsonRecordFromString)(content))

    const parsed: INodePackageJson = {
      name: readOptionalString(raw, 'name'),
      version: readOptionalString(raw, 'version'),
      main: readOptionalString(raw, 'main'),
      types: readOptionalString(raw, 'types'),
      typings: readOptionalString(raw, 'typings'),
      tsdocMetadata: readOptionalString(raw, 'tsdocMetadata'),
    }

    this.#cache.set(normalized, parsed)
    return parsed
  }

  public tryLoadNodePackageJsonFor(fileOrFolderPath: string): INodePackageJson | undefined {
    const packageJsonPath = this.tryGetPackageJsonFilePathFor(fileOrFolderPath)
    if (packageJsonPath === undefined) {
      return undefined
    }
    try {
      return this.loadNodePackageJson(packageJsonPath)
    } catch {
      return undefined
    }
  }
}

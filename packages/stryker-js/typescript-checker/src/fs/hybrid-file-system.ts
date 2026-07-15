import { readFileSync } from 'fs'

import type { FileSystem, FileSystemEntries } from 'typescript/unstable/fs'

import { toPosixFileName } from '../tsconfig-helpers.js'

import { ScriptFile } from './script-file.js'

/**
 * A very simple hybrid file system.
 * * Readonly from disk
 * * Writes in-memory
 * * Hard caching
 * * Ability to mutate one file
 */
export class HybridFileSystem implements FileSystem {
  private readonly files = new Map<string, ScriptFile | undefined>()

  /**
   * Map of absolute tsconfig file paths to their adjusted JSON content.
   * This allows the TS7 API to read overridden compiler options.
   */
  public tsConfigOverrides = new Map<string, string>()

  public readFile = (fileName: string): string | null | undefined => {
    const normalized = toPosixFileName(fileName)
    if (this.fileNameIsBuildInfo(normalized)) {
      return null
    }
    const override = this.tsConfigOverrides.get(normalized)
    if (override !== undefined) {
      return override
    }
    const file = this.files.get(normalized)
    if (file) {
      return file.content
    }
    if (file === undefined && this.files.has(normalized)) {
      // File was previously read and does not exist
      return null
    }
    return undefined
  }

  public fileExists = (fileName: string): boolean | undefined => {
    const normalized = toPosixFileName(fileName)
    if (this.fileNameIsBuildInfo(normalized)) {
      return false
    }
    if (this.tsConfigOverrides.has(normalized)) {
      return true
    }
    if (this.files.has(normalized)) {
      return this.files.get(normalized) !== undefined
    }
    return undefined
  }

  public directoryExists = (): boolean | undefined => {
    return undefined
  }

  public getAccessibleEntries = (): FileSystemEntries | undefined => {
    return undefined
  }

  public realpath = (): string | undefined => {
    return undefined
  }

  public writeFile(fileName: string, data: string): void {
    const normalized = toPosixFileName(fileName)
    const existingFile = this.files.get(normalized)
    if (existingFile) {
      existingFile.write(data)
    } else {
      this.files.set(normalized, new ScriptFile(data, normalized))
    }
  }

  public getFile(fileName: string): ScriptFile | undefined {
    const normalized = toPosixFileName(fileName)
    if (!this.files.has(normalized)) {
      try {
        const content = readFileSync(normalized, 'utf-8')
        this.files.set(normalized, new ScriptFile(content, normalized))
      } catch {
        this.files.set(normalized, undefined)
      }
    }
    return this.files.get(normalized)
  }

  public mutateFile(
    fileName: string,
    mutant: Parameters<ScriptFile['mutate']>[0],
  ): void {
    const file = this.getFile(fileName)
    if (!file) {
      throw new Error(`Tried to mutate file "${fileName}" but it could not be found.`)
    }
    file.mutate(mutant)
  }

  public resetFile(fileName: string): void {
    const file = this.getFile(fileName)
    file?.resetMutant()
  }

  public existsInMemory(fileName: string): boolean {
    const file = this.files.get(toPosixFileName(fileName))
    return file !== undefined
  }

  private fileNameIsBuildInfo(fileName: string): boolean {
    return fileName.endsWith('.tsbuildinfo')
  }
}

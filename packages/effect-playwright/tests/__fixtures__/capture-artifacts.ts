import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const makeCaptureDirectory = (): string => mkdtempSync(join(tmpdir(), 'effect-playwright-capture-'))

export const removeCaptureDirectory = (directory: string): void => {
  rmSync(directory, { recursive: true, force: true })
}

export const captureArtifactPath = (directory: string) => (fileName: string): string => join(directory, fileName)

export const captureArtifactSize = (path: string): number => (existsSync(path) ? statSync(path).size : 0)

export const captureArtifactSignature = (path: string): Uint8Array =>
  existsSync(path) ? new Uint8Array(readFileSync(path).subarray(0, 4)) : new Uint8Array(0)

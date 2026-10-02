import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export const tempTestFile = (): string => join(mkdtempSync(join(tmpdir(), 'property-seed-store-')), 'case.test.ts')

export const seedStorePath = (testFile: string): string =>
  join(dirname(testFile), '__property_seeds__', `${basename(testFile)}.jsonl`)

export const writeStoreLines = (input: {
  readonly testFile: string
  readonly lines: ReadonlyArray<string>
}): void => {
  mkdirSync(dirname(seedStorePath(input.testFile)), { recursive: true })
  writeFileSync(seedStorePath(input.testFile), input.lines.map((line) => `${line}\n`).join(''))
}

export const removeTempTree = (testFile: string): void => {
  rmSync(dirname(testFile), { recursive: true, force: true })
}

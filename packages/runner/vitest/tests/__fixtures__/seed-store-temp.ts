import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** The number of entries the seed store beside `testFile` holds: 0 when the run wrote none. */
export const storedEntries = (testFile: string): number =>
  existsSync(seedStorePath(testFile))
    ? readFileSync(seedStorePath(testFile), 'utf8').split('\n').filter((line) => line.length > 0).length
    : 0

export const removeTempTree = (testFile: string): void => {
  rmSync(dirname(testFile), { recursive: true, force: true })
}

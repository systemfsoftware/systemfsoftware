/**
 * The reporter shell (CONST-B1): it owns the two file reads and the one file
 * write, and the pure core in `src/reporter.ts` decides what they mean.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { laneReport } from '../src/reporter.js'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = join(packageDir, '.oracle', 'report.json')
const dispositionPath = join(packageDir, 'disposition.json')

const textOf = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

const output = laneReport({
  reportText: readFileSync(reportPath, 'utf8'),
  dispositionText: textOf(dispositionPath),
  dispositionPath,
  write: process.env['XSTATE_ORACLE_WRITE'] === '1',
})

if (output.dispositionText !== undefined) writeFileSync(dispositionPath, output.dispositionText)
process.stdout.write(output.stdout)
process.stderr.write(output.stderr)
process.exit(output.exitCode)

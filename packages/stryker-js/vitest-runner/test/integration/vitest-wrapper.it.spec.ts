import { createRequire } from 'module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createVitest as createVitestOriginal } from 'vitest/node'

import { resolveVitest } from '../../src/vitest-wrapper.js'

/**
 * Writes a real `vitest` package into `<dir>/node_modules/vitest` so the
 * directory has a "local" Vitest whose identity is distinguishable from the
 * bundled one. The resolver exercises real module resolution against it.
 */
function writeFakeLocalVitest(dir: string, version: string): void {
  const vitestDir = path.join(dir, 'node_modules', 'vitest')
  fs.mkdirSync(vitestDir, { recursive: true })
  fs.writeFileSync(
    path.join(vitestDir, 'package.json'),
    JSON.stringify({
      name: 'vitest',
      version,
      type: 'module',
      exports: {
        './node': './node.js',
        './package.json': './package.json',
      },
    }),
  )
  fs.writeFileSync(
    path.join(vitestDir, 'node.js'),
    `export const createVitest = () => ${JSON.stringify(`local-${version}`)}\n`,
  )
}

describe('Vitest resolution contract', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-'))
  })

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('should not read the working directory when imported in a fresh process', () => {
    // V4: importing the module must perform no filesystem read in the working
    // directory — the old import-time branch read exactly that directory.
    const importPurityProbe = `
      import fs from 'node:fs'
      const touched = []
      const wrap = (name, fn) => (...args) => {
        const p = String(args[0])
        if (p.startsWith(process.cwd())) touched.push(name + ':' + p)
        return fn(...args)
      }
      fs.readFileSync = wrap('readFileSync', fs.readFileSync)
      fs.statSync = wrap('statSync', fs.statSync)
      fs.existsSync = wrap('existsSync', fs.existsSync)
      fs.realpathSync = wrap('realpathSync', fs.realpathSync)
      fs.readdirSync = wrap('readdirSync', fs.readdirSync)
      const pr = fs.promises
      pr.readFile = wrap('promises.readFile', pr.readFile)
      await import(${
      JSON.stringify(
        pathToFileURL(
          path.resolve(
            path.dirname(new URL(import.meta.url).pathname),
            '..',
            '..',
            'src',
            'vitest-wrapper.ts',
          ),
        ).href,
      )
    })
      console.log('TOUCHED_CWD=' + JSON.stringify(touched))
    `
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-cwd-'))
    try {
      const result = execFileSync(process.execPath, ['--input-type=module', '--eval', importPurityProbe], {
        cwd,
        encoding: 'utf8',
      })
      expect(result).toContain('TOUCHED_CWD=[]')
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('should return the local Vitest when the directory has one', async () => {
    writeFakeLocalVitest(projectDir, '9.9.9-local')

    const resolved = await resolveVitest(projectDir)

    expect(resolved.version).toBe('9.9.9-local')
  })

  it('should fall back to the bundled Vitest when the directory has none', async () => {
    const dirWithoutVitest = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-empty-'))
    try {
      const resolved = await resolveVitest(dirWithoutVitest)

      expect(resolved.createVitest).toBe(createVitestOriginal)
      expect(resolved.version).toBe(
        createRequire(import.meta.url)(
          createRequire(import.meta.url).resolve('vitest/package.json'),
        ).version,
      )
    } finally {
      fs.rmSync(dirWithoutVitest, { recursive: true, force: true })
    }
  })

  it('should resolve a different version for each directory in one process', async () => {
    // R3: the property a frozen singleton could not hold.
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-a-'))
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-b-'))
    try {
      writeFakeLocalVitest(dirA, '9.9.9-a')
      writeFakeLocalVitest(dirB, '9.9.9-b')

      const resolvedA = await resolveVitest(dirA)
      const resolvedB = await resolveVitest(dirB)

      expect(resolvedA.version).toBe('9.9.9-a')
      expect(resolvedB.version).toBe('9.9.9-b')
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true })
      fs.rmSync(dirB, { recursive: true, force: true })
    }
  })
})

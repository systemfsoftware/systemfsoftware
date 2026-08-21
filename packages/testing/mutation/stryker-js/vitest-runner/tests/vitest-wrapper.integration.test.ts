import { createRequire } from 'module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import type { Scope } from 'effect/Scope'
import { expect } from 'vitest'
import { createVitest as createVitestOriginal } from 'vitest/node'

import * as S from 'effect/Schema'

import { resolveVitest } from '../src/vitest-wrapper.js'
import { VitestPackageSchema } from '../src/vitest-wrapper.schema.js'

const Feature = makeFeature({ it, layer })

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

const tempDir = (prefix: string): Effect.Effect<string, never, Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), prefix))),
    (dir) => Effect.sync(() => fs.rmSync(dir, { recursive: true, force: true })),
  )

Feature('Resolving the project-local Vitest installation')
  .body(({ scenario }) => {
    scenario(
      'importing the wrapper performs no filesystem read of the working directory',
      Gherkin.Do.pipe(
        When('the wrapper is imported in a fresh process whose cwd is watched')('output', () => {
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
                  'dist',
                  'index.mjs',
                ),
              ).href,
            )
          })
            console.log('TOUCHED_CWD=' + JSON.stringify(touched))
          `
          return Effect.promise(async () => {
            const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-cwd-'))
            try {
              return execFileSync(process.execPath, ['--input-type=module', '--eval', importPurityProbe], {
                cwd,
                encoding: 'utf8',
              })
            } finally {
              fs.rmSync(cwd, { recursive: true, force: true })
            }
          })
        }),
        Then('no file read of the working directory is recorded')((s) => {
          expect(s.output).toContain('TOUCHED_CWD=[]')
        }),
      ),
    )

    scenario(
      'a directory with a local vitest resolves that version',
      Gherkin.Do.pipe(
        Given('a temporary project directory')('dir', () => tempDir('vitest-wrapper-')),
        When('a local vitest package with a distinct version is written into it')(
          'resolved',
          (s) =>
            Effect.promise(async () => {
              writeFakeLocalVitest(s.dir, '9.9.9-local')
              return resolveVitest(s.dir)
            }),
        ),
        Then('the local version is reported')((s) => {
          expect(s.resolved.version).toBe('9.9.9-local')
        }),
      ),
    )

    scenario(
      'a directory without a local vitest falls back to the bundled one',
      Gherkin.Do.pipe(
        Given('a temporary empty directory')('dir', () => tempDir('vitest-wrapper-empty-')),
        When('the resolver is asked for that directory')('resolved', (s) => Effect.promise(() => resolveVitest(s.dir))),
        Then('the bundled createVitest and version are reported')((s) => {
          expect(s.resolved.createVitest).toBe(createVitestOriginal)
          expect(s.resolved.version).toBe(
            S.decodeUnknownSync(VitestPackageSchema)(
              createRequire(import.meta.url)(
                createRequire(import.meta.url).resolve('vitest/package.json'),
              ),
            ).version,
          )
        }),
      ),
    )

    scenario(
      'each directory resolves its own vitest version in one process',
      Gherkin.Do.pipe(
        Given('two temporary directories')('dirs', () =>
          Effect.promise(async () => {
            const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-a-'))
            const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-wrapper-b-'))
            return { dirA, dirB }
          })),
        When('a different local vitest is written into each')('resolved', (s) =>
          Effect.promise(async () => {
            writeFakeLocalVitest(s.dirs.dirA, '9.9.9-a')
            writeFakeLocalVitest(s.dirs.dirB, '9.9.9-b')
            const resolvedA = await resolveVitest(s.dirs.dirA)
            const resolvedB = await resolveVitest(s.dirs.dirB)
            return { resolvedA, resolvedB }
          })),
        Then('each resolver reports its own version')((s) => {
          expect(s.resolved.resolvedA.version).toBe('9.9.9-a')
          expect(s.resolved.resolvedB.version).toBe('9.9.9-b')
        }),
      ),
    )
  })

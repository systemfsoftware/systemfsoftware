import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect, Schema as S } from 'effect'
import { afterEach, beforeEach, expect } from 'vitest'

import { forkCoreSchema } from '../src/config/fork-schema.js'
import { readConfigFile, resolveExtends } from '../src/config/resolve-extends.js'
import { ConfigError } from '../src/errors.js'
import { OptionDocument } from './__fixtures__/option-document.schema.js'

const decodeOptionDocument = S.decodeUnknownSync(S.fromJsonString(OptionDocument))

const Feature = makeFeature({ it, layer })

let tmpDir: string

beforeEach(() => {
  // Inside the package, never `os.tmpdir()`. A config that extends a package
  // specifier is resolved by walking up from the config's own directory, so a
  // fixture in `/tmp` can only resolve if something outside the repository
  // happens to provide the package — which is exactly the environment
  // dependence this suite exists to disprove. It passed here through the test
  // runner's own resolver and failed under plain node in CI. `node_modules` is
  // already ignored by git, and the walk up from here reaches the workspace
  // link for real.
  tmpDir = mkdtempSync(join(import.meta.dirname, '..', 'node_modules', 'stryker-extends-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const writeJson = (rel: string, content: unknown): string => {
  const file = join(tmpDir, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(content, null, 2), 'utf-8')
  return file
}

const writeJs = (rel: string, content: string): string => {
  const file = join(tmpDir, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf-8')
  return file
}

/** Resolves an extends chain as the SUT, keeping the declared return type loud. */
const resolveChain = async (file: string): Promise<PartialStrykerOptions> =>
  resolveExtends(file, await readConfigFile(file))

/** Captures a rejection as a value so the scenario can assert on it. */
const rejectionOf = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (error: unknown) => error,
  )

const assertConfigError = (actual: unknown, messagePattern: RegExp): void => {
  if (!(actual instanceof ConfigError)) {
    throw new Error(`Expected a ConfigError, got ${String(actual)}`)
  }
  expect(actual.message).toMatch(messagePattern)
}

Feature('Resolving a stryker config via its extends chain')
  .body(({ scenario }) => {
    // readConfigFile — the real read boundary: JSON parsing and JS module loading.
    // These stay in the integration suite: they assert a real filesystem read of a
    // real config file, which no pure decision can stand in for.
    scenario(
      'Should_ParseAJsonConfigFile_When_ItIsWellFormed',
      Gherkin.Do.pipe(
        Given('a well-formed JSON config file')(
          'file',
          () => Effect.sync(() => writeJson('cfg.json', { a: 1, b: 'two' })),
        ),
        When('the file is read')('config', (s) => Effect.promise(() => readConfigFile(s.file))),
        Then('its object is returned')((s) => {
          expect(s.config).toEqual({ a: 1, b: 'two' })
        }),
      ),
    )

    scenario(
      'Should_ThrowAConfigError_When_TheJsonFileIsMalformed',
      Gherkin.Do.pipe(
        Given('a file with malformed JSON')('file', () => Effect.sync(() => writeJs('bad.json', '{ not json'))),
        When('the read is attempted')('failure', (s) => Effect.promise(() => rejectionOf(readConfigFile(s.file)))),
        Then('a ConfigError naming the file is thrown')((s) => {
          assertConfigError(s.failure, /bad\.json/)
        }),
      ),
    )

    scenario(
      'Should_ThrowAConfigError_When_AJsModuleHasNoDefaultExport',
      Gherkin.Do.pipe(
        Given('a JS module that exports only named bindings')(
          'file',
          () => Effect.sync(() => writeJs('cfg.mjs', 'export const a = 1\n')),
        ),
        When('the read is attempted')('failure', (s) => Effect.promise(() => rejectionOf(readConfigFile(s.file)))),
        Then('a ConfigError about the missing default export is thrown')((s) => {
          assertConfigError(s.failure, /Default export/)
        }),
      ),
    )

    scenario(
      'Should_ThrowAConfigErrorNamingTheFile_When_AJsModuleFailsToImport',
      Gherkin.Do.pipe(
        Given('a JS module that throws at import time')(
          'file',
          () => Effect.sync(() => writeJs('cfg.mjs', 'throw new Error("boom")\n')),
        ),
        When('the read is attempted')('failure', (s) => Effect.promise(() => rejectionOf(readConfigFile(s.file)))),
        Then('a ConfigError about the import failure is thrown')((s) => {
          assertConfigError(s.failure, /Error during import/)
        }),
      ),
    )

    scenario(
      'Should_ThrowAConfigError_WhenTheJsonConfigParsesToANonObject',
      Gherkin.Do.pipe(
        Given('a JSON config file holding an array')('file', () => Effect.sync(() => writeJson('cfg.json', [1, 2, 3]))),
        When('the read is attempted')('failure', (s) => Effect.promise(() => rejectionOf(readConfigFile(s.file)))),
        Then('a ConfigError about the non-object shape is thrown')((s) => {
          assertConfigError(s.failure, /must be a JSON object/)
        }),
      ),
    )

    // The chain boundary — the whole walk reads real files and merges what it read
    scenario(
      'Should_ReturnTheFileContent_When_NoExtendsIsPresent',
      Gherkin.Do.pipe(
        Given('a config file without an extends key')(
          'file',
          () => Effect.sync(() => writeJson('child.json', { a: 1, b: 2 })),
        ),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.file))),
        Then('the file content is returned as-is')((s) => {
          expect(s.config).toEqual({ a: 1, b: 2 })
        }),
      ),
    )

    scenario(
      'Should_InheritAKey_When_TheChildDoesNotStateIt',
      Gherkin.Do.pipe(
        Given('a base config and a child extending it')('child', () => {
          writeJson('base.json', { a: 1, b: 2 })
          return Effect.succeed(writeJson('child.json', { extends: './base.json', b: 9 }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the parent key the child omits is inherited')((s) => {
          expect(s.config).toEqual({ a: 1, b: 9 })
        }),
      ),
    )

    scenario(
      'Should_FailWithTheParentPath_When_TheExtendsTargetIsMissing',
      Gherkin.Do.pipe(
        Given('a child whose extends points at a missing file')(
          'child',
          () => Effect.succeed(writeJson('child.json', { extends: './missing.json' })),
        ),
        When('the chain is resolved')(
          'failure',
          (s) => Effect.promise(() => rejectionOf(resolveChain(s.child))),
        ),
        Then('the error names the missing parent path')((s) => {
          assertConfigError(s.failure, /missing\.json/)
        }),
      ),
    )

    scenario(
      'Should_FailWithTheParentPath_When_TheExtendsTargetIsMalformedJson',
      Gherkin.Do.pipe(
        Given('a child whose extends points at malformed JSON')('child', () => {
          writeJs('bad.json', '{ not json')
          return Effect.succeed(writeJson('child.json', { extends: './bad.json' }))
        }),
        When('the chain is resolved')(
          'failure',
          (s) => Effect.promise(() => rejectionOf(resolveChain(s.child))),
        ),
        Then('the error names the malformed parent file')((s) => {
          assertConfigError(s.failure, /bad\.json/)
        }),
      ),
    )

    scenario(
      'Should_ResolveAChainFromAConfigModule_When_TheChildIsAJavaScriptModule',
      Gherkin.Do.pipe(
        Given('a JS child config importing its base as a module')('child', () => {
          writeJson('base.json', { a: 1 })
          return Effect.sync(() =>
            writeJs(
              'child.mjs',
              `import base from './base.json' with { type: 'json' }\nexport default { ...base, b: 2 }\n`,
            )
          )
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the module default export is merged like a JSON config')((s) => {
          expect(s.config).toEqual({ a: 1, b: 2 })
        }),
      ),
    )

    // The fork schema and the shipped schema artifact — the extends key at the root
    scenario(
      'Should_DeclareExtendsAtTheRoot_When_TheForkSchemaIsDerived',
      Gherkin.Do.pipe(
        Given('the derived fork option schema')('document', () => Effect.succeed(forkCoreSchema)),
        Then('extends is declared among its properties')((s) => {
          const doc = S.decodeUnknownSync(OptionDocument)(s.document)
          expect(doc.properties['extends']).toBeDefined()
        }),
      ),
    )

    scenario(
      'Should_DeclareExtendsAtTheRoot_When_TheShippedSchemaJsonIsRead',
      Gherkin.Do.pipe(
        Given('the shipped stryker-schema.json document')(
          'raw',
          () => Effect.sync(() => readFileSync(resolve(import.meta.dirname, '../schema/stryker-schema.json'), 'utf-8')),
        ),
        Then('the document declares extends at the root')((s) => {
          const doc = decodeOptionDocument(s.raw)
          expect(doc.properties['extends']).toBeDefined()
        }),
      ),
    )

    // A specifier that nothing installed — the resolver's failure bound
    scenario(
      'Should_ThrowAConfigErrorNamingTheSpecifier_When_ItCannotBeResolved',
      Gherkin.Do.pipe(
        Given('a config extending an uninstalled package specifier')(
          'child',
          () => Effect.sync(() => writeJson('child.json', { extends: '@nope/not-installed' })),
        ),
        When('the chain is resolved')('failure', (s) => Effect.promise(() => rejectionOf(resolveChain(s.child)))),
        Then('a ConfigError naming the specifier is thrown')((s) => {
          assertConfigError(s.failure, /@nope\/not-installed/)
        }),
      ),
    )

    // The shipped base preset — the real boundary: an installed package's exports
    // subpath actually resolves, and its content merges with what the child reads.
    scenario(
      'Should_ResolveTheShippedBasePreset_When_UsingTheSpecifierPackageConfigsUse',
      Gherkin.Do.pipe(
        Given('a child config extending the shipped base-preset specifier')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
              })
            ),
        ),
        When('the chain resolves the specifier')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the preset shipped with the package is inherited')((s) => {
          expect(s.config['testRunner']).toBe('vitest')
        }),
      ),
    )

    scenario(
      'Should_SupplyTheModalOptions_When_AConfigOmitsThem',
      Gherkin.Do.pipe(
        Given('a child config extending the shipped base')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
              })
            ),
        ),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the modal options default in from the base')((s) => {
          expect(s.config['mutate']).toEqual(['src/only-this.ts'])
          expect(s.config['testRunner']).toBe('vitest')
          expect(s.config['thresholds']).toEqual({ high: 100, low: 80, break: 100 })
        }),
      ),
    )

    scenario(
      'Should_TurnIncrementalOn_When_ThePackageDoesNotOptOut',
      Gherkin.Do.pipe(
        Given('a child config extending the shipped preset')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
              })
            ),
        ),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('incremental is on with the default report path')((s) => {
          expect(s.config['incremental']).toBe(true)
          expect(s.config['incrementalFile']).toBe('reports/stryker-incremental.json')
        }),
      ),
    )

    scenario(
      'Should_ActivateOnlyTheDeclarationIgnorer_When_ExtendingTheBase',
      Gherkin.Do.pipe(
        Given('a child config extending the shipped preset')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
              })
            ),
        ),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the ignorer loaders are inherited while only the declaration ignorer is active')((s) => {
          expect(s.config['plugins']).toEqual(
            expect.arrayContaining([
              '@systemfsoftware/stryker-plugins/effect-schema-ignorer',
              '@systemfsoftware/stryker-plugins/workflow-make-ignorer',
            ]),
          )
          expect(s.config['ignorers']).toEqual(['effect-schema-declarations'])
        }),
      ),
    )

    scenario(
      'Should_LetAPackageAddWorkflowMakeBoundary_When_DeclaringItLocally',
      Gherkin.Do.pipe(
        Given('a child config adding a local ignorer over the base')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
                ignorers: ['effect-schema-declarations', 'workflow-make-boundary'],
              })
            ),
        ),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the additively-listed ignorer survives the merge')((s) => {
          expect(s.config['ignorers']).toEqual(['effect-schema-declarations', 'workflow-make-boundary'])
        }),
      ),
    )

    scenario(
      'Should_InheritTheBaseLoaders_When_ThePackageUnderSpecifiesPlugins',
      Gherkin.Do.pipe(
        Given('a child config that names only its own plugin')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
                plugins: ['@systemfsoftware/stryker-js-vitest-runner'],
              })
            ),
        ),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the base loaders and the child plugin are all present')((s) => {
          expect(s.config['plugins']).toEqual(
            expect.arrayContaining([
              '@systemfsoftware/stryker-js-vitest-runner',
              '@systemfsoftware/stryker-js-typescript-checker',
              '@systemfsoftware/stryker-plugins/effect-schema-ignorer',
              '@systemfsoftware/stryker-plugins/workflow-make-ignorer',
            ]),
          )
        }),
      ),
    )

    scenario(
      'Should_CarryDisableBail_When_ExtendingTheBase',
      Gherkin.Do.pipe(
        Given('a child config extending the shipped preset')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
              })
            ),
        ),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('disableBail is inherited as true')((s) => {
          expect(s.config['disableBail']).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_LetAPackageOverrideTheInheritedThresholds_When_DeclaringItsOwn',
      Gherkin.Do.pipe(
        Given('a child config overriding the base thresholds')(
          'child',
          () =>
            Effect.sync(() =>
              writeJson('stryker.config.json', {
                extends: '@systemfsoftware/stryker-js-mutation-run/config/base',
                mutate: ['src/only-this.ts'],
                thresholds: { high: 100, low: 100, break: 100 },
              })
            ),
        ),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the child thresholds win')((s) => {
          expect(s.config['thresholds']).toEqual({ high: 100, low: 100, break: 100 })
        }),
      ),
    )
  })

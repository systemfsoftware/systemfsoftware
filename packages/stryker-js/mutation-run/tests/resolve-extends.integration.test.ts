import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { dirname, join, resolve } from 'path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect, Match, Schema as S } from 'effect'
import { afterEach, beforeEach, expect } from 'vitest'

import { decideExtendsStep, initialExtendsStepState, mergeConfigs } from '../src/config/extends-step.js'
import { forkCoreSchema } from '../src/config/fork-schema.js'
import { readConfigFile, resolveExtends } from '../src/config/resolve-extends.js'
import { ConfigError } from '../src/errors.js'
import { OptionDocument } from './__fixtures__/option-document.schema.js'

const decodeOptionDocument = S.decodeUnknownSync(S.fromJsonString(OptionDocument))

const Feature = makeFeature({ it, layer })

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stryker-extends-'))
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

const writeFakePackage = (
  hostDir: string,
  name: string,
  exportsMap: Record<string, string>,
  files: Record<string, unknown>,
): string => {
  const pkgDir = join(tmpDir, hostDir, 'node_modules', ...name.split('/'))
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', exports: exportsMap }, null, 2),
    'utf-8',
  )
  for (const [rel, content] of Object.entries(files)) {
    const f = join(pkgDir, rel)
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, JSON.stringify(content, null, 2), 'utf-8')
  }
  return pkgDir
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
    // mergeConfigs — the R2/R3/R4 merge rules over a child config
    scenario(
      'Should_ReturnParentVerbatim_When_ChildIsEmpty',
      Gherkin.Do.pipe(
        Given('a parent with two keys and an empty child')('options', () =>
          Effect.succeed({
            parent: { a: 1, b: 2 },
            child: {},
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the parent is returned verbatim')((s) => {
          expect(s.merged).toEqual({ a: 1, b: 2 })
        }),
      ),
    )

    scenario(
      'Should_ReplaceTheInheritedScalar_When_TheChildStatesAScalar',
      Gherkin.Do.pipe(
        Given('a parent and a child that both state the key')('options', () =>
          Effect.succeed({
            parent: { a: 1, b: 2 },
            child: { b: 9 },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the child scalar wins')((s) => {
          expect(s.merged).toEqual({ a: 1, b: 9 })
        }),
      ),
    )

    scenario(
      'Should_ReplaceTheInheritedArray_When_TheChildStatesAnArray',
      Gherkin.Do.pipe(
        Given('a parent array and a child array')('options', () =>
          Effect.succeed({
            parent: { x: [1, 2, 3] },
            child: { x: [9] },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the child array replaces the parent array wholesale')((s) => {
          expect(s.merged).toEqual({ x: [9] })
        }),
      ),
    )

    scenario(
      'Should_NotConcatenateArrays_When_TheChildOverridesAnArray',
      Gherkin.Do.pipe(
        Given('a parent array and a child array')('options', () =>
          Effect.succeed({
            parent: { x: [1, 2, 3] },
            child: { x: [4, 5] },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the parent entries are gone')((s) => {
          expect(s.merged['x']).toEqual([4, 5])
        }),
      ),
    )

    scenario(
      'Should_ConcatenatePluginLists_When_TheChildAddsPluginDescriptors',
      Gherkin.Do.pipe(
        Given('a parent plugin list and a child plugin list')('options', () =>
          Effect.succeed({
            parent: { plugins: ['@base/a', '@base/b'] },
            child: { plugins: ['@child/c'] },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('plugins is the one array that concatenates')((s) => {
          expect(s.merged['plugins']).toEqual(['@base/a', '@base/b', '@child/c'])
        }),
      ),
    )

    scenario(
      'Should_KeepTheFirstOccurrence_When_ParentAndChildNameTheSamePlugin',
      Gherkin.Do.pipe(
        Given('a parent and child that both name the same plugin descriptor')('options', () =>
          Effect.succeed({
            parent: { plugins: ['@base/a', '@base/b'] },
            child: { plugins: ['@base/b', '@child/c'] },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the duplicated descriptor appears once, at its first position')((s) => {
          expect(s.merged['plugins']).toEqual(['@base/a', '@base/b', '@child/c'])
        }),
      ),
    )

    scenario(
      'Should_StartFromTheChildList_When_TheParentStatesNoPlugins',
      Gherkin.Do.pipe(
        Given('a parent without plugins and a child with a plugin list')('options', () =>
          Effect.succeed({
            parent: { a: 1 },
            child: { plugins: ['@child/c'] },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the child plugin list is used as-is')((s) => {
          expect(s.merged['plugins']).toEqual(['@child/c'])
        }),
      ),
    )

    scenario(
      'Should_DeleteTheInheritedPluginList_When_TheChildStatesPluginsNull',
      Gherkin.Do.pipe(
        Given('a parent plugin list and a child config file declaring plugins null')(
          'child',
          () => Effect.succeed(writeJson('child.json', { plugins: null })),
        ),
        When('the child is read and merged')(
          'merged',
          (s) => Effect.promise(async () => mergeConfigs({ plugins: ['@base/a'] }, await readConfigFile(s.child))),
        ),
        Then('the key is deleted, not concatenated')((s) => {
          expect(s.merged).toEqual({})
          expect('plugins' in s.merged).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_MergeObjectsOneLevelDeep_When_TheChildPartiallyOverrides',
      Gherkin.Do.pipe(
        Given('a parent object and a child partial override')('options', () =>
          Effect.succeed({
            parent: { x: { a: 1, b: 2, c: 3 } },
            child: { x: { b: 9, d: 4 } },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the keys merge one level deep')((s) => {
          expect(s.merged).toEqual({ x: { a: 1, b: 9, c: 3, d: 4 } })
        }),
      ),
    )

    scenario(
      'Should_DeleteAnInheritedKey_When_TheChildSetsItToNull',
      Gherkin.Do.pipe(
        Given('a parent with two keys and a child nulling one')('options', () =>
          Effect.succeed({
            parent: { a: 1, b: 2 },
            child: { b: null },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the nulled key is gone from the result')((s) => {
          expect(s.merged).toEqual({ a: 1 })
        }),
      ),
    )

    scenario(
      'Should_DeleteAnObjectValuedKey_When_TheChildSetsItToNull',
      Gherkin.Do.pipe(
        Given('a parent object-valued key and a child nulling it')('options', () =>
          Effect.succeed({
            parent: { x: { a: 1 } },
            child: { x: null },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the key is deleted rather than assigned null')((s) => {
          expect(s.merged).toEqual({})
          expect('x' in s.merged).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_NoOp_When_TheChildNullsAKeyTheParentDoesNotHave',
      Gherkin.Do.pipe(
        Given('a parent without the key and a child nulling it')('options', () =>
          Effect.succeed({
            parent: { a: 1 },
            child: { b: null },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the parent is unchanged')((s) => {
          expect(s.merged).toEqual({ a: 1 })
        }),
      ),
    )

    scenario(
      'Should_KeepTheInheritedRelativePathValue_When_Merging',
      Gherkin.Do.pipe(
        Given('a parent with a relative path value and a child with unrelated keys')('options', () =>
          Effect.succeed({
            parent: { incrementalFile: 'reports/stryker-incremental.json' },
            child: { mutate: ['src/x.ts'] },
          })),
        When('they are merged')('merged', (s) => Effect.sync(() => mergeConfigs(s.options.parent, s.options.child))),
        Then('the inherited value is unchanged')((s) => {
          expect(s.merged).toEqual({
            incrementalFile: 'reports/stryker-incremental.json',
            mutate: ['src/x.ts'],
          })
        }),
      ),
    )

    // readConfigFile — raw JSON and JS config loading
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

    // resolveExtendsChain — the full extends resolution
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
      'Should_ReplaceTheInheritedScalar_When_TheChildStatesOne',
      Gherkin.Do.pipe(
        Given('a base config and a child overriding a scalar')('child', () => {
          writeJson('base.json', { a: 1 })
          return Effect.succeed(writeJson('child.json', { extends: './base.json', a: 99 }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the child scalar wins')((s) => {
          expect(s.config).toEqual({ a: 99 })
        }),
      ),
    )

    scenario(
      'Should_ReplaceTheInheritedArray_When_TheChildStatesOne',
      Gherkin.Do.pipe(
        Given('a base config and a child overriding an array')('child', () => {
          writeJson('base.json', { mutate: ['src/a.ts', 'src/b.ts'] })
          return Effect.succeed(writeJson('child.json', { extends: './base.json', mutate: ['src/c.ts'] }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the child array replaces the inherited one wholesale')((s) => {
          expect(s.config).toEqual({ mutate: ['src/c.ts'] })
        }),
      ),
    )

    scenario(
      'Should_MergeObjectsOneLevelDeep_When_TheChildOverridesPartially',
      Gherkin.Do.pipe(
        Given('a base config and a child overriding part of a nested object')('child', () => {
          writeJson('base.json', { vitest: { dir: '.', related: true, configFile: 'vitest.config.ts' } })
          return Effect.succeed(writeJson('child.json', { extends: './base.json', vitest: { related: false } }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the nested object merges one level deep')((s) => {
          expect(s.config).toEqual({
            vitest: { dir: '.', related: false, configFile: 'vitest.config.ts' },
          })
        }),
      ),
    )

    scenario(
      'Should_DeleteAnInheritedKey_When_TheChildSetsItToNull',
      Gherkin.Do.pipe(
        Given('a base config and a child nulling an inherited key')('child', () => {
          writeJson('base.json', { a: 1, b: 2 })
          return Effect.succeed(writeJson('child.json', { extends: './base.json', b: null }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the nulled key is gone')((s) => {
          expect(s.config).toEqual({ a: 1 })
        }),
      ),
    )

    scenario(
      'Should_DeleteAnObjectValuedKey_When_TheChildSetsItNull',
      Gherkin.Do.pipe(
        Given('a base config and a child nulling an inherited object key')('child', () => {
          writeJson('base.json', { vitest: { dir: '.' } })
          return Effect.succeed(writeJson('child.json', { extends: './base.json', vitest: null }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the object-valued key is deleted')((s) => {
          expect(s.config).toEqual({})
          expect('vitest' in s.config).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_WinTheNearestAncestor_When_AThreeLevelChainExists',
      Gherkin.Do.pipe(
        Given('a three-level chain with overlapping keys')('child', () => {
          writeJson('grand.json', { a: 'gp', b: 'gp', c: 'gp' })
          writeJson('parent.json', { extends: './grand.json', b: 'parent', c: 'parent' })
          return Effect.succeed(writeJson('child.json', { extends: './parent.json', c: 'child' }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the nearest ancestor wins for each key')((s) => {
          expect(s.config).toEqual({ a: 'gp', b: 'parent', c: 'child' })
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
      'Should_FailRatherThanRecurse_When_TwoFilesExtendEachOther',
      Gherkin.Do.pipe(
        Given('two files extending each other')('files', () =>
          Effect.sync(() => {
            writeJson('b.json', { extends: './a.json' })
            const a = writeJson('a.json', { extends: './b.json' })
            return { a, b: join(tmpDir, 'b.json') }
          })),
        When('the chain is resolved from each end')('failures', (s) =>
          Effect.promise(async () => {
            const fromA = await rejectionOf(resolveChain(s.files.a))
            const fromB = await rejectionOf(resolveChain(s.files.b))
            return { fromA, fromB }
          })),
        Then('both ends report the cycle')((s) => {
          assertConfigError(s.failures.fromA, /cycle/i)
          assertConfigError(s.failures.fromB, /cycle/i)
        }),
      ),
    )

    scenario(
      'Should_FailRatherThanRecurse_When_AConfigExtendsItself',
      Gherkin.Do.pipe(
        Given('a config extending itself')(
          'self',
          () => Effect.succeed(writeJson('self.json', { extends: './self.json' })),
        ),
        When('the chain is resolved')('failure', (s) => Effect.promise(() => rejectionOf(resolveChain(s.self)))),
        Then('the self-cycle is reported')((s) => {
          assertConfigError(s.failure, /cycle/i)
        }),
      ),
    )

    scenario(
      'Should_KeepAnInheritedRelativePathValue_When_ResolvingTheChain',
      Gherkin.Do.pipe(
        Given('a base config with a relative path value')('child', () => {
          writeJson('base.json', { incrementalFile: 'reports/stryker-incremental.json' })
          return Effect.succeed(writeJson('child.json', { extends: './base.json', mutate: ['src/x.ts'] }))
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the inherited relative value is untouched')((s) => {
          expect(s.config).toEqual({
            incrementalFile: 'reports/stryker-incremental.json',
            mutate: ['src/x.ts'],
          })
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

    // forkCoreSchema + shipped stryker-schema.json — the extends key at the root
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

    // ConfigReader integration — the child config wins and extends is stripped
    scenario(
      'Should_StripTheExtendsKey_When_TheChainIsResolved',
      Gherkin.Do.pipe(
        Given('a base and a child that each declare overlapping keys')('child', () => {
          writeJson('base.json', { a: 1, b: 2, mutate: ['src/a.ts'] })
          return Effect.sync(() => writeJson('child.json', { extends: './base.json', b: 9 }))
        }),
        When('the chain is resolved')('resolved', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the child values win and extends is gone')((s) => {
          expect(s.resolved).toEqual({ a: 1, b: 9, mutate: ['src/a.ts'] })
          expect('extends' in s.resolved).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_TreatTopLevelExtendsNull_When_ItMatchesAChainNull',
      Gherkin.Do.pipe(
        Given('a base config whose own extends is null')(
          'base',
          () => Effect.sync(() => writeJson('base.json', { a: 1, extends: null })),
        ),
        When('the chain is resolved')('resolved', (s) => Effect.promise(() => resolveChain(s.base))),
        Then('the null extends is dropped and the content kept')((s) => {
          expect(s.resolved).toEqual({ a: 1 })
        }),
      ),
    )

    // resolveExtendsTarget — path and package-specifier routing
    scenario(
      'Should_ResolveRelativePathsAgainstTheConfigDirectory_When_ResolvingATarget',
      Gherkin.Do.pipe(
        Given('a relative extends value in a config at the directory')(
          'read',
          () =>
            Effect.sync(() =>
              Match.value(
                decideExtendsStep(
                  initialExtendsStepState,
                  { extends: './base.json' },
                  path.join('/somewhere/pkg', 'stryker.config.json'),
                ),
              ).pipe(
                Match.tag('read', (read) => read.path),
                Match.orElse(() => undefined),
              )
            ),
        ),
        Then('the path is resolved against the config directory')((s) => {
          expect(s.read).toBe(path.resolve('/somewhere/pkg', './base.json'))
        }),
      ),
    )

    scenario(
      'Should_ResolveAnAbsolutePathUnchanged_When_ResolvingATarget',
      Gherkin.Do.pipe(
        Given('an absolute extends value in a config elsewhere')(
          'read',
          () =>
            Effect.sync(() =>
              Match.value(
                decideExtendsStep(
                  initialExtendsStepState,
                  { extends: path.resolve('/somewhere/base.json') },
                  path.join('/elsewhere', 'stryker.config.json'),
                ),
              ).pipe(
                Match.tag('read', (read) => read.path),
                Match.orElse(() => undefined),
              )
            ),
        ),
        Then('the absolute path passes through')((s) => {
          expect(s.read).toBe(path.resolve('/somewhere/base.json'))
        }),
      ),
    )

    scenario(
      'Should_ResolveAScopedPackageSpecifier_When_ItIsInstalledUnderNodeModules',
      Gherkin.Do.pipe(
        Given('a fake package installed with an exports map')(
          'pkgDir',
          () =>
            Effect.sync(() =>
              writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {
                'base.json': { a: 1 },
              })
            ),
        ),
        When('a chain beside it extends the scoped specifier')(
          'config',
          () =>
            Effect.promise(async () =>
              resolveChain(writeJson('pkg/stryker.config.json', { extends: '@fake/preset/base', b: 9 }))
            ),
        ),
        Then('the node_modules base is inherited through the specifier')((s) => {
          expect(s.config).toEqual({ a: 1, b: 9 })
        }),
      ),
    )

    scenario(
      'Should_HonourTheExportsMap_When_ResolvingASubpath',
      Gherkin.Do.pipe(
        Given('a package whose exports map redirects the subpath')(
          'pkgDir',
          () =>
            Effect.succeed(writeFakePackage('pkg', '@fake/preset', { './base': './dist/generated.json' }, {
              'dist/generated.json': { a: 1 },
              'base.json': { a: 'wrong-file' },
            })),
        ),
        When('a chain beside it extends the exports-mapped subpath')(
          'config',
          () =>
            Effect.promise(async () =>
              resolveChain(writeJson('pkg/stryker.config.json', { extends: '@fake/preset/base', b: 9 }))
            ),
        ),
        Then('the exports-map target wins over the literal subpath')((s) => {
          expect(s.config).toEqual({ a: 1, b: 9 })
        }),
      ),
    )

    scenario(
      'Should_ResolveFromTheConfigDirectory_When_ADifferentPackageIsInstalledAtTheCwd',
      Gherkin.Do.pipe(
        Given('a near config directory that holds the package')(
          'pkgDir',
          () =>
            Effect.succeed(writeFakePackage('near', '@fake/preset', { './base': './near.json' }, {
              'near.json': { which: 'near' },
            })),
        ),
        When('a chain there extends the specifier')(
          'config',
          () =>
            Effect.promise(async () =>
              resolveChain(writeJson('near/stryker.config.json', { extends: '@fake/preset/base', marker: 1 }))
            ),
        ),
        Then('the config-directory installation is used, not the cwd one')((s) => {
          expect(s.config['which']).toBe('near')
          expect(s.config['marker']).toBe(1)
        }),
      ),
    )

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

    // extends via a package specifier — end-to-end chain through node_modules
    scenario(
      'Should_InheritFromAPackageParent_When_ExtendingAVersionedSpecifier',
      Gherkin.Do.pipe(
        Given('a package parent and a child extending it')('child', () => {
          writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {
            'base.json': { a: 1, b: 2 },
          })
          return Effect.sync(() =>
            writeJson('pkg/stryker.config.json', {
              extends: '@fake/preset/base',
              b: 9,
            })
          )
        }),
        When('the chain is resolved')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the package parent is inherited with the child override')((s) => {
          expect(s.config).toEqual({ a: 1, b: 9 })
        }),
      ),
    )

    scenario(
      'Should_ApplyTheNullDeleteRule_When_TheInheritedKeyComesFromAPackageParent',
      Gherkin.Do.pipe(
        Given('a package parent and a child nulling an inherited key')('child', () => {
          writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {
            'base.json': { a: 1, checkers: ['typescript'] },
          })
          return Effect.sync(() =>
            writeJson('pkg/stryker.config.json', {
              extends: '@fake/preset/base',
              checkers: null,
            })
          )
        }),
        When('the chain resolves')('config', (s) => Effect.promise(() => resolveChain(s.child))),
        Then('the key inherited from the package is gone')((s) => {
          expect(s.config).toEqual({ a: 1 })
          expect('checkers' in s.config).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_DetectACycleThatRunsThroughAPackageSpecifier',
      Gherkin.Do.pipe(
        Given('a package parent and a child whose files point at each other')('pkgDir', () =>
          Effect.sync(() => {
            const pkgDir = writeFakePackage('pkg', '@fake/preset', { './base': './base.json' }, {})
            const child = path.join(tmpDir, 'pkg', 'stryker.config.json')
            writeFileSync(
              path.join(pkgDir, 'base.json'),
              JSON.stringify({ extends: child }),
              'utf-8',
            )
            writeFileSync(
              child,
              JSON.stringify({ extends: '@fake/preset/base' }),
              'utf-8',
            )
            return child
          })),
        When('the chain resolves')('failure', (s) => Effect.promise(() => rejectionOf(resolveChain(s.pkgDir)))),
        Then('the cycle through the package is reported')((s) => {
          assertConfigError(s.failure, /cycle/i)
        }),
      ),
    )

    // the shipped base preset — what every package config inherits
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
        Then('the two ignorer loaders are inherited while only one ignorer is active')((s) => {
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
        Then('the base checker, ignorer loaders, and the child plugin are all present')((s) => {
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

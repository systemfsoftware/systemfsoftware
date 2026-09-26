import { createRuleTester } from './_tester.js'

import {
  EFFECT_ROOT_ACTUAL,
  PURE_IMPORT_ACTUAL,
  PURE_IMPORT_EXPECTED,
  PURE_IMPORT_FIX,
} from '../schema-file-imports-pure-modules-only.config.js'
import { schemaFileImportsPureModulesOnly } from '../schema-file-imports-pure-modules-only.js'

const ruleTester = createRuleTester()

const importError = (source: string) => ({
  messageId: 'nonPureImport',
  data: {
    name: 'a value import',
    expected: PURE_IMPORT_EXPECTED,
    actual: PURE_IMPORT_ACTUAL.replace('{{source}}', source),
    fix: PURE_IMPORT_FIX,
  },
})

const effectRootError = (names: string) => ({
  messageId: 'nonPureImport',
  data: {
    name: 'a value import',
    expected: PURE_IMPORT_EXPECTED,
    actual: EFFECT_ROOT_ACTUAL.replace('{{names}}', names),
    fix: PURE_IMPORT_FIX,
  },
})

const reexportError = (source: string) => ({
  messageId: 'nonPureImport',
  data: {
    name: 'a re-export',
    expected: PURE_IMPORT_EXPECTED,
    actual: PURE_IMPORT_ACTUAL.replace('{{source}}', source),
    fix: PURE_IMPORT_FIX,
  },
})

const SCHEMA_FILE = '/repo/pkg/src/domain.schema.ts'

ruleTester.run('schema-file-imports-pure-modules-only', schemaFileImportsPureModulesOnly, {
  valid: [
    {
      name: 'Should_Pass_When_BareEffectImportIsAllPureRootNames',
      code: `import { Schema, Effect, pipe, Array as Arr } from 'effect'
export const S = Schema`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BareEffectBindsSchemaFamilyNames',
      code: `import { Schema, SchemaGetter, SchemaIssue, SchemaTransformation, Encoding } from 'effect'
export const x = [Schema, SchemaGetter, SchemaIssue, SchemaTransformation, Encoding]`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_PureFacadeSubpathIsImported',
      code: `import * as Option from 'effect/Option'
export const x = Option.some(1)`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_EffectIsImportedFromEffectSubpath',
      code: `import * as Effect from 'effect/Effect'
export const x = Effect.succeed(1)`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_PipeableAndPlatformErrorAreImported',
      code: `import { pipeArguments } from 'effect/Pipeable'
import * as PlatformError from 'effect/PlatformError'
import { Pipeable } from 'effect'
export const x = [pipeArguments, PlatformError.systemError, Pipeable]`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SchemaFamilySubpathIsImported',
      code: `import * as SchemaAST from 'effect/SchemaAST'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as Encoding from 'effect/Encoding'
export const x = [SchemaAST, SchemaGetter, Encoding]`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ArbitraryModuleForToCodecArbitraryIsImported',
      code: `import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
export const x = Arbitrary.schema`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_RelativeSchemaJsIsImported',
      code: `import { Foo } from './foo.schema.js'
export const x = Foo`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_RelativeParentSchemaTsIsImported',
      code: `import { Foo } from '../shared/foo.schema.ts'
export const x = Foo`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_WorkspacePackageIsImported',
      code: `import { Spec } from '@systemfsoftware/effect-daemon-spec'
export const x = Spec`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ImportIsTypeOnlyDeclaration',
      code: `import type { Foo } from './foo.js'
export type Bar = Foo`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_EverySpecifierIsTypeOnly',
      code: `import { type Foo } from './foo.js'
export type Bar = Foo`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SpecifierIsTypeOnlyAndSiblingIsPure',
      code: `import { type Foo, Schema } from 'effect'
export const x = [Schema, 0 as unknown as Foo]`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_TypeOnlyImportNamesAnIoBuiltin',
      code: `import type { Stats } from 'node:fs'
export type S = Stats`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ExportIsTypeOnly',
      code: `export type { Foo } from './foo.js'`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ExportSpecifierIsTypeOnly',
      code: `export { type Foo } from './foo.js'`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Ignore_When_DynamicImportInsideVitestBlock',
      code: `if (import.meta.vitest) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Ignore_When_FileIsNotASchemaFile',
      code: `import * as fs from 'node:fs'
export const x = fs`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Ignore_When_LocalReexportHasNoSource',
      code: `const x = 1
export { x }`,
      filename: SCHEMA_FILE,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_NodeBuiltinIsImported',
      code: `import * as fs from 'node:fs'
export const x = fs`,
      filename: SCHEMA_FILE,
      errors: [importError('node:fs')],
    },
    {
      name: 'Should_Report_When_NodeBuiltinSubpathIsImported',
      code: `import { readFile } from 'node:fs/promises'
export const x = readFile`,
      filename: SCHEMA_FILE,
      errors: [importError('node:fs/promises')],
    },
    {
      name: 'Should_Report_When_RelativeNonSchemaModuleIsImported',
      code: `import { helper } from './helper.js'
export const x = helper`,
      filename: SCHEMA_FILE,
      errors: [importError('./helper.js')],
    },
    {
      name: 'Should_Report_When_RelativeWorkflowModuleIsImported',
      code: `import { decide } from './x.workflow.js'
export const x = decide`,
      filename: SCHEMA_FILE,
      errors: [importError('./x.workflow.js')],
    },
    {
      name: 'Should_Report_When_BareFastCheckIsImported',
      code: `import * as fc from 'fast-check'
export const x = fc`,
      filename: SCHEMA_FILE,
      errors: [importError('fast-check')],
    },
    {
      name: 'Should_Report_When_ThirdPartyPackageIsImported',
      code: `import { map } from 'lodash'
export const x = map`,
      filename: SCHEMA_FILE,
      errors: [importError('lodash')],
    },
    {
      name: 'Should_Report_When_SideEffectImportIsOutsideThePureSet',
      code: `import './side-effect.js'
export const x = 1`,
      filename: SCHEMA_FILE,
      errors: [importError('./side-effect.js')],
    },
    {
      name: 'Should_Report_When_BareEffectBindsAnIoName',
      code: `import { Layer } from 'effect'
export const x = Layer`,
      filename: SCHEMA_FILE,
      errors: [effectRootError('Layer')],
    },
    {
      name: 'Should_Report_When_BareEffectMixesPureAndIoNames',
      code: `import { Schema, Layer } from 'effect'
export const x = [Schema, Layer]`,
      filename: SCHEMA_FILE,
      errors: [effectRootError('Layer')],
    },
    {
      name: 'Should_Report_When_BareEffectNamespaceImportCannotBeProvenPure',
      code: `import * as E from 'effect'
export const x = E`,
      filename: SCHEMA_FILE,
      errors: [effectRootError('E')],
    },
    {
      name: 'Should_Report_When_ValueReexportIsOutsideThePureSet',
      code: `export { x } from './y.js'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('./y.js')],
    },
    {
      name: 'Should_Report_When_ExportAllIsOutsideThePureSet',
      code: `export * from './y.js'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('./y.js')],
    },
  ],
})

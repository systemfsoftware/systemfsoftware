import { createRuleTester } from './_tester.js'

import {
  BARREL_ACTUAL,
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

const barrelError = (source: string, names: string) => ({
  messageId: 'nonPureImport',
  data: {
    name: 'a value import',
    expected: PURE_IMPORT_EXPECTED,
    actual: BARREL_ACTUAL.replace('{{source}}', source).replace('{{names}}', names),
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

const dynamicImportError = (source: string) => ({
  messageId: 'nonPureImport',
  data: {
    name: 'a dynamic import',
    expected: PURE_IMPORT_EXPECTED,
    actual: PURE_IMPORT_ACTUAL.replace('{{source}}', source),
    fix: PURE_IMPORT_FIX,
  },
})

const requireError = (source: string) => ({
  messageId: 'nonPureImport',
  data: {
    name: 'a require call',
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
      code: `import { Schema, SchemaGetter, SchemaIssue, SchemaTransformation } from 'effect'
export const x = [Schema, SchemaGetter, SchemaIssue, SchemaTransformation]`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_EncodingBarrelBindsCodecNames',
      code: `import { Base64, Hex } from 'effect/encoding'
export const x = [Base64.encode, Hex.encode]`,
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
import * as Hex from 'effect/encoding/Hex'
export const x = [SchemaAST, SchemaGetter, Hex]`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ArbitraryModuleForToCodecArbitraryIsImported',
      code: `import * as Arbitrary from 'effect/Arbitrary'
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
      name: 'Should_Ignore_When_RequireInsideVitestBlock',
      code: `if (import.meta.vitest !== void 0) {
  const fs = require('node:fs')
  void fs
}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_DynamicImportIsAnAllowedSchemaFamilySubpath',
      code: `const loaded = import('effect/Schema')
export const x = loaded`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Ignore_When_DynamicImportIsInANonSchemaFile',
      code: `const loaded = import('node:fs')
export const x = loaded`,
      filename: '/repo/pkg/src/domain.ts',
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
    {
      name: 'Should_Pass_When_ExportAllIsTypeOnly',
      code: `export type * from './y.js'`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ACallOtherThanRequireIsMade',
      code: `const loaded = readConfig('node:fs')
export const x = loaded`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Ignore_When_TheGuardComparesAgainstNull',
      code: `if (import.meta.vitest !== null) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Ignore_When_TheGuardComparesAgainstTheUndefinedIdentifier',
      code: `if (import.meta.vitest !== undefined) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Ignore_When_TheSentinelStandsOnTheLeft',
      code: `if (undefined !== import.meta.vitest) {
  void import('node:fs')
}`,
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
      errors: [barrelError('effect', 'Layer')],
    },
    {
      name: 'Should_Report_When_BareEffectMixesPureAndIoNames',
      code: `import { Schema, Layer } from 'effect'
export const x = [Schema, Layer]`,
      filename: SCHEMA_FILE,
      errors: [barrelError('effect', 'Layer')],
    },
    {
      name: 'Should_Report_When_BareEffectNamespaceImportCannotBeProvenPure',
      code: `import * as E from 'effect'
export const x = E`,
      filename: SCHEMA_FILE,
      errors: [barrelError('effect', 'E')],
    },
    {
      name: 'Should_Report_When_AreaBarrelBindsANameOutsideThePureSet',
      code: `import { Base64, Yaml } from 'effect/encoding'
export const x = [Base64, Yaml]`,
      filename: SCHEMA_FILE,
      errors: [barrelError('effect/encoding', 'Yaml')],
    },
    {
      name: 'Should_Report_When_AreaModuleSubpathIsOutsideThePureSet',
      code: `import * as Yaml from 'effect/encoding/Yaml'
export const x = Yaml`,
      filename: SCHEMA_FILE,
      errors: [importError('effect/encoding/Yaml')],
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
    {
      name: 'Should_Report_When_DynamicImportOfNodeBuiltin',
      code: `const loaded = import('node:fs')
export const x = loaded`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_AwaitDynamicImportOfNodeBuiltin',
      code: `const loaded = async () => await import('node:fs')
export const x = loaded`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_DynamicImportOfRelativeNonSchemaModule',
      code: `const loaded = import('./helper.js')
export const x = loaded`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('./helper.js')],
    },
    {
      name: 'Should_Report_When_DynamicImportSourceIsNotAStringLiteral',
      code: `const name = './helper.js'
const loaded = import(name)
export const x = loaded`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('<dynamic>')],
    },
    {
      name: 'Should_Report_When_DynamicImportIsKeyedToANonPositiveGuard',
      code: `if (import.meta.vitest || true) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_RequireOfNodeBuiltin',
      code: `const fs = require('node:fs')
export const x = fs`,
      filename: SCHEMA_FILE,
      errors: [requireError('node:fs')],
    },
    {
      name: 'Should_Report_When_RequireSourceIsNotAStringLiteral',
      code: `const name = 'node:fs'
const fs = require(name)
export const x = fs`,
      filename: SCHEMA_FILE,
      errors: [requireError('<dynamic>')],
    },
    {
      name: 'Should_Report_When_BareEffectMixesTypeOnlyAndIoNames',
      code: `import { type Foo, Layer } from 'effect'
export const x = [Layer, 0 as unknown as Foo]`,
      filename: SCHEMA_FILE,
      errors: [barrelError('effect', 'Layer')],
    },
    {
      name: 'Should_Name_Every_Impure_Import_In_The_Barrel_Message',
      code: `import { Layer, Console } from 'effect'
export const x = [Layer, Console]`,
      filename: SCHEMA_FILE,
      errors: [barrelError('effect', 'Layer, Console')],
    },
    {
      name: 'Should_Report_When_TheGuardedTestAintTheVitestGuard',
      code: `if (import.meta.other) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_TheVitestGuardComparesToZero',
      code: `if (import.meta.vitest !== 0) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_TheVitestGuardComparesToAPlusZero',
      code: `if (import.meta.vitest !== +0) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_TheVitestGuardComparesToVoidOne',
      code: `if (import.meta.vitest !== void 1) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_TheVitestGuardComparesToOne',
      code: `if (import.meta.vitest !== 1) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_TheGuardComparesALocalToUndefined',
      code: `if (token !== undefined) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_UndefinedOnTheLeftComparesToALocal',
      code: `if (undefined !== token) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_TheVitestGuardUsesStrictEquality',
      code: `if (import.meta.vitest === undefined) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_TheGuardComparesToALocal',
      code: `if (import.meta.vitest !== token) {
  void import('node:fs')
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
    {
      name: 'Should_Report_When_AnImportSitsOutsideTheVitestGuard',
      code: `if (import.meta.vitest) {
  void import('node:fs')
}

void import('node:fs')`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('node:fs')],
    },
  ],
})

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
      name: 'Should_Ignore_When_GuardedDynamicImportNamesTheWorkspaceRunner',
      code: `if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')
  void it
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
      name: 'Should_Pass_When_FamilySpecifierIsImportedTypeOnly',
      code: `import type { FSM } from '@systemfsoftware/xstate/fsm'
export type Step = FSM`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_EveryFamilySpecifierIsAnInlineType',
      code: `import { type FSM } from '@systemfsoftware/xstate/fsm'
export type Step = FSM`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_FamilySpecifierIsReexportedTypeOnly',
      code: `export type { Machine } from '@systemfsoftware/xstate'`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_AnotherWorkspacePackageIsValueImported',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
export const x = Workflow`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_LookalikeWorkspaceFamilyPrefixIsValueImported',
      code: `import { Thing } from '@systemfsoftware/xstated-thing'
export const x = Thing`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ImportEqualsBindsAPureSchemaSubpath',
      code: `import S = require('effect/Schema')
export const x = S`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_FamilyImportEqualsIsTypeOnly',
      code: `import type M = require('@systemfsoftware/xstate')
export type FSM = M.Machine`,
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
      name: 'Should_Report_When_FamilyIsAwaitedAsADynamicImportInsideTheVitestGuard',
      code: `if (import.meta.vitest !== void 0) {
  const { createFSM } = await import('@systemfsoftware/xstate/fsm')
  void createFSM
}`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('@systemfsoftware/xstate/fsm')],
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
      name: 'Should_Report_When_FamilyIsRequiredInsideTheVitestGuard',
      code: `if (import.meta.vitest !== void 0) {
  const { createFSM } = require('xstate')
  void createFSM
}`,
      filename: SCHEMA_FILE,
      errors: [requireError('xstate')],
    },
    {
      name: 'Should_Report_When_WorkspaceFamilySubpathIsValueImported',
      code: `import { createFSM } from '@systemfsoftware/xstate/fsm'
export const x = createFSM`,
      filename: SCHEMA_FILE,
      errors: [importError('@systemfsoftware/xstate/fsm')],
    },
    {
      name: 'Should_Report_When_ABareFamilySubpathIsValueImported',
      code: `import { createMachine } from 'xstate/guards'
export const x = createMachine`,
      filename: SCHEMA_FILE,
      errors: [importError('xstate/guards')],
    },
    {
      name: 'Should_Report_When_BareFamilyRootIsValueReexported',
      code: `export * from '@systemfsoftware/xstate'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Report_When_BareFamilyIsAwaitedAsADynamicImportOutsideTheVitestGuard',
      code: `const loaded = async () => await import('xstate')
export const x = loaded`,
      filename: SCHEMA_FILE,
      errors: [dynamicImportError('xstate')],
    },
    {
      name: 'Should_Report_When_SiblingFamilyPackageIsValueReexported',
      code: `export { createFSM } from '@xstate/fsm'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('@xstate/fsm')],
    },
    {
      name: 'Should_Report_When_SiblingFamilyPrefixPackageIsValueImported',
      code: `import { createFSM } from '@systemfsoftware/xstate-effect'
export const x = createFSM`,
      filename: SCHEMA_FILE,
      errors: [importError('@systemfsoftware/xstate-effect')],
    },
    {
      name: 'Should_Report_When_BareXstateIsValueImported',
      code: `import { createMachine } from 'xstate'
export const x = createMachine`,
      filename: SCHEMA_FILE,
      errors: [importError('xstate')],
    },
    {
      name: 'Should_Report_When_BareFamilyWorkspaceRootIsValueImported',
      code: `import { createFSM } from '@systemfsoftware/xstate'
export const x = createFSM`,
      filename: SCHEMA_FILE,
      errors: [importError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Report_When_FamilyIsRequiredAtModuleScope',
      code: `const { createFSM } = require('@systemfsoftware/xstate')
export const x = createFSM`,
      filename: SCHEMA_FILE,
      errors: [requireError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Report_When_MixedTypeAndValueImportComesFromTheFamily',
      code: `import { type Machine, createFSM } from '@systemfsoftware/xstate'
export const x = createFSM`,
      filename: SCHEMA_FILE,
      errors: [importError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Report_When_FamilyIsRequiredByImportEquals',
      code: `import fsm = require('@systemfsoftware/xstate')
export const x = fsm`,
      filename: SCHEMA_FILE,
      errors: [requireError('@systemfsoftware/xstate')],
    },
    {
      name: 'Should_Report_When_NodeBuiltinIsRequiredByImportEquals',
      code: `import fs = require('node:fs')
export const x = fs`,
      filename: SCHEMA_FILE,
      errors: [requireError('node:fs')],
    },
  ],
})

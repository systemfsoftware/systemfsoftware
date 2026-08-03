import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { MULTIPLE_FOREIGN_SYSTEMS_EXPECTED, MULTIPLE_FOREIGN_SYSTEMS_FIX } from '../shape-one-foreign-system.config.js'
import { shapeOneForeignSystem } from '../shape-one-foreign-system.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

ruleTester.run('shape-one-foreign-system', shapeOneForeignSystem, {
  valid: [
    {
      name: 'Should_Pass_When_SingleForeignPackage',
      code: `import * as memfs from 'memfs'

export type Contents = memfs.DirectoryJSON`,
      filename: 'memory-file-system.shape.ts',
    },
    {
      name: 'Should_Pass_When_SubmoduleImportsSharePackageRoot',
      code: `import { integer, pgTable } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'`,
      filename: 'scans.shape.ts',
    },
    {
      name: 'Should_Pass_When_ScopedPackageSubmodulesShareRoot',
      code: `import { stripe } from '@stripe/stripe-js'
import type { Checkout } from '@stripe/stripe-js/types'`,
      filename: 'checkout.shape.ts',
    },
    {
      name: 'Should_Pass_When_NoPackageImports',
      code: `import { Row } from './local.js'

export interface LocalRow { readonly id: string }`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_NodeBuiltinAlongsideForeignPackage',
      code: `import type { Readable } from 'node:stream'
import * as memfs from 'memfs'`,
      filename: 'memory-file-system.shape.ts',
    },
    {
      name: 'Should_Pass_When_RelativeImportAlongsideForeignPackage',
      code: `import { Columns } from './shared/columns.js'
import { integer, pgTable } from 'drizzle-orm/pg-core'`,
      filename: 'scans.shape.ts',
    },
    {
      name: 'Should_Pass_When_BareScopedSourceAlongsideForeignPackage',
      code: `import { x } from '@scope'
import * as memfs from 'memfs'`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_NoImportsAtAll',
      code: `export interface Row { readonly id: string }`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_ReExportSharesForeignRoot',
      code: `export * from 'memfs'`,
      filename: 'memory-file-system.shape.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorFileImportsTwoPackages',
      code: `import * as memfs from 'memfs'
import { integer, pgTable } from 'drizzle-orm/pg-core'`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_SecondPackageImport_When_TwoForeignPackages',
      code: `import * as memfs from 'memfs'
import { integer, pgTable } from 'drizzle-orm/pg-core'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'multipleForeignSystems',
        data: {
          name: 'drizzle-orm/pg-core',
          expected: MULTIPLE_FOREIGN_SYSTEMS_EXPECTED,
          actual: 'imports from 2 distinct packages (memfs, drizzle-orm)',
          fix: MULTIPLE_FOREIGN_SYSTEMS_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_EveryNonPrimaryRootImport_When_ThreeForeignPackages',
      code: `import { a } from 'pkg-a'
import { b } from 'pkg-b'
import { c } from 'pkg-c'`,
      filename: 'order.shape.ts',
      errors: [
        {
          messageId: 'multipleForeignSystems',
          data: {
            name: 'pkg-b',
            expected: MULTIPLE_FOREIGN_SYSTEMS_EXPECTED,
            actual: 'imports from 3 distinct packages (pkg-a, pkg-b, pkg-c)',
            fix: MULTIPLE_FOREIGN_SYSTEMS_FIX,
          },
        },
        {
          messageId: 'multipleForeignSystems',
          data: {
            name: 'pkg-c',
            expected: MULTIPLE_FOREIGN_SYSTEMS_EXPECTED,
            actual: 'imports from 3 distinct packages (pkg-a, pkg-b, pkg-c)',
            fix: MULTIPLE_FOREIGN_SYSTEMS_FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ReExport_When_SecondForeignPackage',
      code: `import * as memfs from 'memfs'
export * from 'drizzle-orm/pg-core'`,
      filename: 'order.shape.ts',
      errors: [{
        messageId: 'multipleForeignSystems',
        data: {
          name: 'drizzle-orm/pg-core',
          expected: MULTIPLE_FOREIGN_SYSTEMS_EXPECTED,
          actual: 'imports from 2 distinct packages (memfs, drizzle-orm)',
          fix: MULTIPLE_FOREIGN_SYSTEMS_FIX,
        },
      }],
    },
    {
      name: 'Should_Report_ScopedPackage_When_SecondForeignSystem',
      code: `import * as memfs from 'memfs'
import { stripe } from '@stripe/stripe-js'`,
      filename: 'checkout.shape.ts',
      errors: [{
        messageId: 'multipleForeignSystems',
        data: {
          name: '@stripe/stripe-js',
          expected: MULTIPLE_FOREIGN_SYSTEMS_EXPECTED,
          actual: 'imports from 2 distinct packages (memfs, @stripe/stripe-js)',
          fix: MULTIPLE_FOREIGN_SYSTEMS_FIX,
        },
      }],
    },
  ],
})

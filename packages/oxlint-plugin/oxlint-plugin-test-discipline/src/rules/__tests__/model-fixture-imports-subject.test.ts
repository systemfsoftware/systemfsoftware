import { modelFixtureImportsSubject } from '../model-fixture-imports-subject.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const SUBJECT_PACKAGE = '@systemfsoftware/effect-lock'

const subjectImportError = (source: string) => ({
  messageId: 'subjectImport' as const,
  data: {
    name: 'a *.model.ts fixture that imports the package under test',
    expected: 'a pure model that imports only effect, node builtins, and harness types',
    actual: `a dependency on ${source} in a *.model.ts fixture`,
    fix:
      'delete the import; the model derives its state from the declared Schema it is given, so it needs no symbol from the package it stands in for',
  },
})

const relativeEscapeError = (source: string) => ({
  messageId: 'relativeEscape' as const,
  data: {
    name: 'a *.model.ts fixture that climbs out of the tests tree',
    expected: 'a relative import that stays inside the tests tree — a sibling fixture under tests/__fixtures__/',
    actual: `a relative import of ${source}, resolving outside the tests tree`,
    fix:
      'import the sibling fixture with ./<name>.js, or move the model; a model that reaches src/ is the implementation checking itself',
  },
})

ruleTester.run('model-fixture-imports-subject', modelFixtureImportsSubject, {
  valid: [
    {
      name: 'Should_Allow_EffectImport_When_ModelImportsOnlyEffect',
      code: `
        import { Schema } from 'effect'
        export const model = { initial: { held: false }, step: (state) => state }
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
    },
    {
      name: 'Should_Allow_HarnessTypeImport_When_ModelImportsAnotherPackage',
      code: `
        import type { Modeling } from '@systemfsoftware/conformance-spec'
        export const model = { initial: { held: false } }
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
    },
    {
      name: 'Should_Allow_SubjectImport_When_FileIsNotAModelFixture',
      code: `
        import { Lock } from '@systemfsoftware/effect-lock'
        export const lock = Lock.make()
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/Locks.ts',
    },
    {
      name: 'Should_Allow_SubjectImport_When_PathNamesNoTestTree',
      code: `
        import { Lock } from '@systemfsoftware/effect-lock'
        export const lock = Lock.make()
      `,
      filename: '/repo/packages/effect-lock/src/lock.model.ts',
    },
    {
      name: 'Should_Allow_NonLiteralDynamicImport_When_SourceIsUnknown',
      code: `
        const name = './lock.js'
        const mod = import(name)
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
    },
    {
      name: 'Should_Allow_DeepRelativeImport_When_ModelImportsSiblingFixture',
      code: `
        import { LockFakes } from './Locks.js'
        export const lock = LockFakes.nonAtomic()
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
    },
    {
      name: 'Should_Allow_ParentRelativeImport_When_ModelImportsFixtureInsideTree',
      code: `
        import { Fakes } from '../Fakes.js'
        export const lock = Fakes.nonAtomic()
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_SubjectImport_When_ModelImportsPackageUnderTest',
      code: `
        import { Lock } from '@systemfsoftware/effect-lock'
        export const model = { initial: { held: false } }
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [subjectImportError(SUBJECT_PACKAGE)],
    },
    {
      name: 'Should_Report_SubjectImport_When_ModelImportsSubjectSubpath',
      code: `
        import { Fakes } from '@systemfsoftware/effect-lock/testing'
        export const model = { initial: { held: false } }
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [subjectImportError(`${SUBJECT_PACKAGE}/testing`)],
    },
    {
      name: 'Should_Report_SubjectImport_When_ModelImportsTypeOnly',
      code: `
        import type { Lock } from '@systemfsoftware/effect-lock'
        export const model = { initial: { held: false } }
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [subjectImportError(SUBJECT_PACKAGE)],
    },
    {
      name: 'Should_Report_SubjectImport_When_ModelReExportsSubject',
      code: `export { Lock } from '@systemfsoftware/effect-lock'`,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [subjectImportError(SUBJECT_PACKAGE)],
    },
    {
      name: 'Should_Report_SubjectImport_When_ModelStarExportsSubject',
      code: `export * from '@systemfsoftware/effect-lock'`,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [subjectImportError(SUBJECT_PACKAGE)],
    },
    {
      name: 'Should_Report_SubjectImport_When_ModelDynamicallyImportsSubject',
      code: `const mod = import('@systemfsoftware/effect-lock')`,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [subjectImportError(SUBJECT_PACKAGE)],
    },
    {
      name: 'Should_Report_SubjectImport_When_ModelUsesImportEquals',
      code: `import Lock = require('@systemfsoftware/effect-lock')`,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [subjectImportError(SUBJECT_PACKAGE)],
    },
    {
      name: 'Should_Report_RelativeEscape_When_ModelImportsSrcThroughRelativePath',
      code: `
        import { Lock } from '../../src/Lock.js'
        export const model = { initial: { held: false } }
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [relativeEscapeError('../../src/Lock.js')],
    },
    {
      name: 'Should_Report_RelativeEscape_When_ModelImportsPublicModThroughRelativePath',
      code: `
        import { mod } from '../../src/mod.js'
        export const model = { initial: { held: false } }
      `,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [relativeEscapeError('../../src/mod.js')],
    },
    {
      name: 'Should_Report_RelativeEscape_When_ModelDynamicallyImportsSrc',
      code: `const mod = import('../../src/Lock.js')`,
      filename: '/repo/packages/effect-lock/tests/__fixtures__/lock.model.ts',
      errors: [relativeEscapeError('../../src/Lock.js')],
    },
    {
      name: 'Should_Report_SubjectImport_When_PackageSitsInANestedDirectory',
      code: `
        import { Atom } from '@systemfsoftware/effect-atom'
        export const model = { initial: { size: 0 } }
      `,
      filename: '/repo/packages/effect-atom/tests/__fixtures__/collection.model.ts',
      errors: [subjectImportError('@systemfsoftware/effect-atom')],
    },
    {
      name: 'Should_Report_SubjectImport_When_ModelSitsBesideTestTree',
      code: `
        import { Lock } from '@systemfsoftware/effect-lock'
        export const model = { initial: { held: false } }
      `,
      filename: '/repo/packages/effect-lock/tests/lock.model.ts',
      errors: [subjectImportError(SUBJECT_PACKAGE)],
    },
  ],
})

import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { makeCommandSchema } from '../make-command-schema.js'

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

const IMPORT = `import { Workflow } from '@systemfsoftware/effect-cell-types'`
const SCHEMA = `import * as S from 'effect/Schema'`

/** A schema class declaration, the shape every valid command position resolves to. */
const CMD = `class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}`

const DECIDE = `(command: Cmd) => command`

const ASSERTED_EXPECTED =
  'a command position holding a schema class the compiler checked, never a value re-labelled to look like one'
const ASSERTED_ACTUAL = 'a type assertion at the command position'
const ASSERTED_FIX =
  'delete the assertion and pass the schema class itself; if no schema class exists for this command, declare one - an assertion here does not create the identity `make` checks for, it only stops the compiler from noticing its absence'

const LAUNDERED_EXPECTED = 'a command position holding a schema class or the Effect subclass call that produces one'
const LAUNDERED_ACTUAL = 'a call at the command position whose callee is not a schema-class member'
const LAUNDERED_FIX =
  'pass the schema class directly, or extend it with Base.extend(...) which returns one; a wrapper that assembles an object with the right members satisfies the type without carrying the class identity, so delete the wrapper rather than finding it a new home'

const DECLARED_EXPECTED = 'a command position holding a schema class that exists at runtime'
const DECLARED_ACTUAL = 'a `declare`d binding at the command position'
const DECLARED_FIX =
  'delete the `declare` and define the schema class, or import the real one; a declared binding produces no value, so this command position is empty at runtime no matter what its type says'

const assertedError = (name: string) => ({
  messageId: 'assertedCommand',
  data: { name, expected: ASSERTED_EXPECTED, actual: ASSERTED_ACTUAL, fix: ASSERTED_FIX },
})

const launderedError = (name: string) => ({
  messageId: 'launderedCommand',
  data: { name, expected: LAUNDERED_EXPECTED, actual: LAUNDERED_ACTUAL, fix: LAUNDERED_FIX },
})

const declaredError = (name: string) => ({
  messageId: 'declaredCommand',
  data: { name, expected: DECLARED_EXPECTED, actual: DECLARED_ACTUAL, fix: DECLARED_FIX },
})

ruleTester.run('make-command-schema', makeCommandSchema, {
  valid: [
    {
      name: 'Should_Pass_When_TheCommandIsASchemaClassIdentifier',
      code: `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(Cmd, ${DECIDE})`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsAnAliasOfASchemaClass',
      code: `${IMPORT}\n${SCHEMA}\n${CMD}\nconst Aliased = Cmd\nexport const d = Workflow.make(Aliased, ${DECIDE})`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsImportedFromAnotherModule',
      code: `${IMPORT}\nimport { Cmd } from './Cmd.schema.js'\nexport const d = Workflow.make(Cmd, (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsANamespaceImportedMember',
      code:
        `${IMPORT}\nimport * as Schemas from './Cmd.schema.js'\nexport const d = Workflow.make(Schemas.Cmd, (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandExtendsASchemaClass',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nclass Sub extends Cmd {}\nexport const d = Workflow.make(Sub, (c: Sub) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // The idiomatic Effect subclass: a call expression whose callee chain
      // reaches `extend`. Refusing every call would refuse this.
      name: 'Should_Pass_When_TheCommandIsTheEffectSubclassCall',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(Cmd.extend('Sub')({ extra: S.Int }), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsAnInlineSchemaClassCall',
      code:
        `${IMPORT}\n${SCHEMA}\nexport const d = Workflow.make(S.TaggedClass<never>()('Inline', {}), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // Silence is the design: `make` refuses this at construction with TS2740,
      // and a second report is the duplicate report EW1 forbids.
      name: 'Should_Ignore_When_TheCommandIsAPlainClass',
      code: `${IMPORT}\nclass Fake {}\nexport const d = Workflow.make(Fake, (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheCommandIsAnObjectLiteral',
      code: `${IMPORT}\nexport const d = Workflow.make({}, (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheCommandIsAPrimitive',
      code: `${IMPORT}\nexport const d = Workflow.make(1, (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheCommandIsASchemaStruct',
      code: `${IMPORT}\n${SCHEMA}\nexport const d = Workflow.make(S.Struct({}), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheMakeCallPassesNoArguments',
      code: `${IMPORT}\nexport const d = Workflow.make()`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // The boundary is judged by import origin, so a local rebinding of the
      // name is not a Workflow.make call and nothing here is a command position.
      name: 'Should_Ignore_When_TheBoundaryIsShadowedByALocalBinding',
      code:
        `${IMPORT}\nconst Workflow = { make: (a: unknown, b: unknown) => b }\nWorkflow.make(0 as never, (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheFileImportsNoWorkflow',
      code:
        `${SCHEMA}\nconst Workflow = { make: (a: unknown, b: unknown) => b }\nWorkflow.make(0 as never, (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // A factory returning the class returns the class. The value is the real
      // command, so there is nothing here to refuse.
      name: 'Should_Ignore_When_TheCommandComesFromAFactoryCall',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nconst factory = () => Cmd\nexport const d = Workflow.make(factory(), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // The OX-CI1 near-miss: matching is on the canonical spelling, so an
      // aliased receiver does not fire. This fixture exists to keep a widening
      // to aliases from landing unnoticed - it is the documented limit of this
      // rule, and the reason the CI guard covers suppression separately.
      name: 'Should_Ignore_When_ObjectAssignIsReachedThroughAnAlias',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nconst oa = Object.assign\nexport const d = Workflow.make(oa(class {}, Cmd), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // A computed member carries no readable name, so the callee cannot be
      // matched against the enumeration and the rule stays silent.
      name: 'Should_Ignore_When_TheCommandCalleeIsAComputedMember',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nconst key = 'assign'\nexport const d = Workflow.make(Object[key](class {}, Cmd), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // A `new` of anything but the enumerated wrappers is an ordinary
      // construction, decided by the compiler.
      name: 'Should_Ignore_When_TheCommandIsAnOrdinaryNewExpression',
      code: `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(new Cmd(), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TheCommandIsAnAsAssertion',
      code: `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make({} as unknown as Cmd, (c: Cmd) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSAsExpression')],
    },
    {
      name: 'Should_Report_When_TheCommandIsASatisfiesAssertion',
      code: `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(Cmd satisfies unknown, (c: Cmd) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSSatisfiesExpression')],
    },
    {
      name: 'Should_Report_When_TheCommandIsANonNullAssertion',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nconst maybe: Cmd | null = null\nexport const d = Workflow.make(maybe!, (c: Cmd) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSNonNullExpression')],
    },
    {
      name: 'Should_Report_When_TheCommandIsAssembledByObjectAssign',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(Object.assign(class {}, Cmd), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Object.assign')],
    },
    {
      name: 'Should_Report_When_TheCommandComesFromReflectConstruct',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(Reflect.construct(Cmd, []), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Reflect.construct')],
    },
    {
      name: 'Should_Report_When_TheCommandIsAProxyWrapper',
      code: `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(new Proxy(Cmd, {}), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Proxy')],
    },
    {
      name: 'Should_Report_When_TheCommandIsBuiltByObjectCreate',
      code: `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make(Object.create(Cmd), (c: unknown) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Object.create')],
    },
    {
      name: 'Should_Report_When_TheCommandIsADeclaredBinding',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\ndeclare const ghost: typeof Cmd\nexport const d = Workflow.make(ghost, (c: Cmd) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [declaredError('ghost')],
    },
    {
      // The shift `make.call(...)` applies to every construction argument moves
      // the command position too; a locator that missed it would go dark here.
      name: 'Should_Report_When_AnAssertedCommandIsPassedThroughCall',
      code:
        `${IMPORT}\n${SCHEMA}\n${CMD}\nexport const d = Workflow.make.call(null, {} as unknown as Cmd, (c: Cmd) => c)`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSAsExpression')],
    },
  ],
})

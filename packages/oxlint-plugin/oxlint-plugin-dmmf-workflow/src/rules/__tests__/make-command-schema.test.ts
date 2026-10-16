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

/** A schema class declaration, the shape every valid command property resolves to. */
const CMD = `class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}`
const DECISION = `class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}`

const DECIDE = `(command: Cmd) => command`

const ASSERTED_EXPECTED =
  'a command property holding a schema class the compiler checked, never a value re-labelled to look like one'
const ASSERTED_ACTUAL = 'a type assertion at the command property'
const ASSERTED_FIX =
  'delete the assertion and pass the schema class itself; if no schema class exists for this command, declare one - an assertion here does not create the identity `make` checks for, it only stops the compiler from noticing its absence'

const LAUNDERED_EXPECTED = 'a command property holding a schema class or the Effect subclass call that produces one'
const LAUNDERED_ACTUAL = 'a call at the command property whose callee is not a schema-class member'
const LAUNDERED_FIX =
  'pass the schema class directly, or extend it with Base.extend(...) which returns one; a wrapper that assembles an object with the right members satisfies the type without carrying the class identity, so delete the wrapper rather than finding it a new home'

const DECLARED_EXPECTED = 'a command property holding a schema class that exists at runtime'
const DECLARED_ACTUAL = 'a `declare`d binding at the command property'
const DECLARED_FIX =
  'delete the `declare` and define the schema class, or import the real one; a declared binding produces no value, so this command property is empty at runtime no matter what its type says'

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

const PRELUDE = `${IMPORT}\n${SCHEMA}\n${CMD}\n${DECISION}`

const makeWithOptions = (command: string, decide = DECIDE): string =>
  `${PRELUDE}\nexport const d = Workflow.make({ command: ${command}, decision: Decision, error: S.Never, decide: ${decide} })`

ruleTester.run('make-command-schema', makeCommandSchema, {
  valid: [
    {
      name: 'Should_Pass_When_TheCommandIsASchemaClassIdentifier',
      code: makeWithOptions('Cmd'),
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsAnAliasOfASchemaClass',
      code:
        `${PRELUDE}\nconst Aliased = Cmd\nexport const d = Workflow.make({ command: Aliased, decision: Decision, error: S.Never, decide: ${DECIDE} })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsImportedFromAnotherModule',
      code:
        `${IMPORT}\nimport * as S from 'effect/Schema'\n${DECISION}\nimport { Cmd } from './Cmd.schema.js'\nexport const d = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsANamespaceImportedMember',
      code:
        `${IMPORT}\nimport * as S from 'effect/Schema'\n${DECISION}\nimport * as Schemas from './Cmd.schema.js'\nexport const d = Workflow.make({ command: Schemas.Cmd, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandExtendsASchemaClass',
      code:
        `${PRELUDE}\nclass Sub extends Cmd {}\nexport const d = Workflow.make({ command: Sub, decision: Decision, error: S.Never, decide: (c: Sub) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // The idiomatic Effect subclass: a call expression whose callee chain
      // reaches `extend`. Refusing every call would refuse this.
      name: 'Should_Pass_When_TheCommandIsTheEffectSubclassCall',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: Cmd.extend('Sub')({ extra: S.Int }), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheCommandIsAnInlineSchemaClassCall',
      code:
        `${IMPORT}\n${SCHEMA}\n${DECISION}\nexport const d = Workflow.make({ command: S.TaggedClass<never>()('Inline', {}), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // Silence is the design: `make` refuses this at construction with TS2740,
      // and a second report is the duplicate report EW1 forbids.
      name: 'Should_Ignore_When_TheCommandIsAPlainClass',
      code:
        `${IMPORT}\nclass Fake {}\nclass Decision extends S.TaggedClass<Decision>()('Decision', {}) {}\nexport const d = Workflow.make({ command: Fake, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheCommandIsAnObjectLiteral',
      code:
        `${IMPORT}\n${SCHEMA}\n${DECISION}\nexport const d = Workflow.make({ command: {}, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheCommandIsAPrimitive',
      code:
        `${IMPORT}\n${SCHEMA}\n${DECISION}\nexport const d = Workflow.make({ command: 1, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheCommandIsASchemaStruct',
      code:
        `${IMPORT}\n${SCHEMA}\n${DECISION}\nexport const d = Workflow.make({ command: S.Struct({}), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheMakeCallPassesNoOptions',
      code: `${IMPORT}\nexport const d = Workflow.make()`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // The boundary is judged by import origin, so a local rebinding of the
      // name is not a Workflow.make call and nothing here is a command property.
      name: 'Should_Ignore_When_TheBoundaryIsShadowedByALocalBinding',
      code:
        `${IMPORT}\n${SCHEMA}\n${DECISION}\nconst Workflow = { make: (options: unknown) => options }\nWorkflow.make({ command: 0 as never, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Ignore_When_TheFileImportsNoWorkflow',
      code:
        `${SCHEMA}\n${DECISION}\nconst Workflow = { make: (options: unknown) => options }\nWorkflow.make({ command: 0 as never, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // A factory returning the class returns the class. The value is the real
      // command, so there is nothing here to refuse.
      name: 'Should_Ignore_When_TheCommandComesFromAFactoryCall',
      code:
        `${PRELUDE}\nconst factory = () => Cmd\nexport const d = Workflow.make({ command: factory(), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // The OX-CI1 near-miss: matching is on the canonical spelling, so an
      // aliased receiver does not fire. This fixture exists to keep a widening
      // to aliases from landing unnoticed - it is the documented limit of this
      // rule, and the reason the CI guard covers suppression separately.
      name: 'Should_Ignore_When_ObjectAssignIsReachedThroughAnAlias',
      code:
        `${PRELUDE}\nconst oa = Object.assign\nexport const d = Workflow.make({ command: oa(class {}, Cmd), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // A computed member carries no readable name, so the callee cannot be
      // matched against the enumeration and the rule stays silent.
      name: 'Should_Ignore_When_TheCommandCalleeIsAComputedMember',
      code:
        `${PRELUDE}\nconst key = 'assign'\nexport const d = Workflow.make({ command: Object[key](class {}, Cmd), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // A `new` of anything but the enumerated wrappers is an ordinary
      // construction, decided by the compiler.
      name: 'Should_Ignore_When_TheCommandIsAnOrdinaryNewExpression',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: new Cmd(), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // `satisfies` keeps the operand's type, so it cannot relabel a non-class into
      // one; the compiler refuses the laundering attempt (TS2740) and this rule has
      // nothing to add. Pinned so the member cannot drift back into the enumeration.
      name: 'Should_Ignore_When_TheCommandCarriesASatisfiesClause',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: Cmd satisfies unknown, decision: Decision, error: S.Never, decide: (c: Cmd) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      // Locator-form pins: the decision may be written inline, as a same-file
      // reference, as a shorthand property, or through a computed `Workflow['make']`.
      // None of these forms is a command property, so all stay silent here.
      name: 'Should_Pass_When_TheDecisionIsAReferencedModuleScopeFunction',
      code:
        `${PRELUDE}\nconst decide = (command: Cmd) => command\nexport const d = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TheBoundaryIsAComputedMake',
      code:
        `${PRELUDE}\nexport const d = Workflow['make']({ command: Cmd, decision: Decision, error: S.Never, decide: ${DECIDE} })`,
      filename: '/repo/pkg/src/d.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TheCommandIsAnAsAssertion',
      code: makeWithOptions('{} as unknown as Cmd', '(c: Cmd) => c'),
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSAsExpression')],
    },
    {
      name: 'Should_Report_When_TheCommandIsANonNullAssertion',
      code:
        `${PRELUDE}\nconst maybe: Cmd | null = null\nexport const d = Workflow.make({ command: maybe!, decision: Decision, error: S.Never, decide: (c: Cmd) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSNonNullExpression')],
    },
    {
      name: 'Should_Report_When_TheCommandIsAssembledByObjectAssign',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: Object.assign(class {}, Cmd), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Object.assign')],
    },
    {
      name: 'Should_Report_When_TheCommandComesFromReflectConstruct',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: Reflect.construct(Cmd, []), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Reflect.construct')],
    },
    {
      name: 'Should_Report_When_TheCommandIsAProxyWrapper',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: new Proxy(Cmd, {}), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Proxy')],
    },
    {
      name: 'Should_Report_When_TheCommandIsBuiltByObjectCreate',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: Object.create(Cmd), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Object.create')],
    },
    {
      name: 'Should_Report_When_TheCommandIsADeclaredBinding',
      code:
        `${PRELUDE}\ndeclare const ghost: typeof Cmd\nexport const d = Workflow.make({ command: ghost, decision: Decision, error: S.Never, decide: (c: Cmd) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [declaredError('ghost')],
    },
    {
      // The shift `make.call(...)` applies to every construction argument moves
      // the options object too; a locator that missed it would go dark here.
      name: 'Should_Report_When_AnAssertedCommandIsPassedThroughCall',
      code:
        `${PRELUDE}\nexport const d = Workflow.make.call(null, { command: {} as unknown as Cmd, decision: Decision, error: S.Never, decide: (c: Cmd) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSAsExpression')],
    },
    {
      // `make.apply(...)` carries the construction arguments inside an array. Reading
      // the call's own slot 0 yields that array, which no branch classifies - so this
      // fixture was silent until the locator unwrapped the list.
      name: 'Should_Report_When_AnAssertedCommandIsPassedThroughApply',
      code:
        `${PRELUDE}\nexport const d = Workflow.make.apply(null, [{ command: {} as unknown as Cmd, decision: Decision, error: S.Never, decide: (c: Cmd) => c }])`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSAsExpression')],
    },
    {
      // A revocable Proxy is the enumerated wrapper reached by a property read instead
      // of `new`, so the bare command property is a MemberExpression. Measured silent
      // across the whole toolchain before the peel.
      name: 'Should_Report_When_TheCommandIsARevocableProxy',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: Proxy.revocable(Cmd, {}).proxy, decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Proxy.revocable')],
    },
    {
      // `globalThis.X` is the same binding under its qualified spelling, not an alias,
      // so stripping it reaches the enumeration rather than reading as a third segment.
      name: 'Should_Report_When_TheLaunderingCallIsQualifiedByGlobalThis',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: globalThis.Object.assign(class {}, Cmd), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Object.assign')],
    },
    {
      name: 'Should_Report_When_TheLaunderingConstructorIsQualifiedByGlobalThis',
      code:
        `${PRELUDE}\nexport const d = Workflow.make({ command: new globalThis.Proxy(Cmd, {}), decision: Decision, error: S.Never, decide: (c: unknown) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [launderedError('Proxy')],
    },
    {
      // The assertion moved one statement away. This compiles, typechecks, and was
      // measured silent across the whole toolchain except the repo's general anti-cast
      // rule - which an adopter installing this plugin need not have.
      name: 'Should_Report_When_TheCommandBindingWasInitialisedByAnAssertion',
      code:
        `${PRELUDE}\nconst Forged = {} as unknown as typeof Cmd\nexport const d = Workflow.make({ command: Forged, decision: Decision, error: S.Never, decide: (c: Cmd) => c })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSAsExpression')],
    },
    {
      // The command property carries the laundering even when the decision is a
      // shorthand property: the two options slots are read independently.
      name: 'Should_Report_When_TheCommandIsAnAssertionBesideAShorthandDecide',
      code:
        `${PRELUDE}\nconst decide = (command: Cmd) => command\nexport const d = Workflow.make({ command: {} as unknown as Cmd, decision: Decision, error: S.Never, decide })`,
      filename: '/repo/pkg/src/d.workflow.ts',
      errors: [assertedError('TSAsExpression')],
    },
  ],
})

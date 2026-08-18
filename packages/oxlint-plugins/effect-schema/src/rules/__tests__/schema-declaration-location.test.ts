import { createRuleTester } from './_tester.js'

import { schemaDeclarationLocation } from '../schema-declaration-location.js'

const ruleTester = createRuleTester()

const EXPECTED =
  'module-scope schema declarations only in *.schema.ts (any stem, several per file) or in the owning <stem>.workflow.ts'
const ACTUAL =
  'a schema declared in a file that is neither *.schema.ts nor a single-segment <stem>.workflow.ts, in a module-scope position that runs at import'
const FIX =
  'move it to <stem>.schema.ts or into the *.workflow.ts that owns it and import it; a schema only a test uses belongs in tests/__fixtures__/<stem>.schema.ts'

const error = (name: string) => ({
  messageId: 'schemaOutsideSchemaFile',
  data: { name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
})

const UNRESOLVED_EXPECTED =
  'a module-scope binding whose initializer the rule can resolve to a definite schema or a definite non-schema'
const UNRESOLVED_ACTUAL =
  'a member or call chain on a base that positively resolves to the Schema vocabulary (the Schema namespace, an alias of it, or a vocabulary-valued handle), where the member, key or intermediate hop could not be statically determined — so the binding MAY hold a schema'
const UNRESOLVED_FIX =
  'declare the schema in <stem>.schema.ts or the owning <stem>.workflow.ts, or make the chain statically resolvable: access the vocabulary through a literal member key instead of a computed one'

const unresolved = (name: string) => ({
  messageId: 'unresolvedSchemaChain',
  data: { name, expected: UNRESOLVED_EXPECTED, actual: UNRESOLVED_ACTUAL, fix: UNRESOLVED_FIX },
})

ruleTester.run('schema-declaration-location', schemaDeclarationLocation, {
  valid: [
    {
      // The combinator itself, never called: `Schema.Struct` is a function, so binding
      // it or extending it declares no schema. Only `Schema.String`-style members
      // already denote one, and those still report.
      name: 'Should_Pass_When_TheBareCombinatorIsBoundWithoutBeingCalled',
      code: `import { Schema as S } from 'effect'
export const combinator = S.Struct`,
      filename: '/repo/pkg/src/zz-byte.ts',
    },
    {
      name: 'Should_Report_Nothing_When_AClassExtendsTheBareCombinator',
      code: `import { Schema as S } from 'effect'
const extend = (): typeof S.Struct => S.Struct
class ZzProbeClass extends extend() {}
void ZzProbeClass`,
      filename: '/repo/pkg/src/zz-byte.ts',
    },
    {
      name: 'Should_Pass_When_ClassAndConstSchemasLiveInASchemaFile',
      code: `import { Schema } from 'effect'
export class E extends Schema.TaggedError<E>()('E', { message: Schema.String }) {}
export const U = Schema.Union([Schema.String, Schema.Number])`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      name: 'Should_Pass_When_SchemasLiveInTheOwningWorkflowFile',
      code: `import { Schema } from 'effect'
export const DecideInput = Schema.Struct({ n: Schema.Number })`,
      filename: '/repo/pkg/src/decide.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SchemaIsBlockScopedInsideAnInSourceVitestBlock',
      code: `import { Schema } from 'effect'
if (import.meta.vitest) {
  const TagError = Schema.TaggedStruct('T', { code: Schema.Number })
}`,
      filename: '/repo/pkg/src/helper.kernel.ts',
    },
    {
      name: 'Should_Pass_When_DecodeCallHasNoModuleScopeBinding',
      code: `import { Schema } from 'effect'
export function decode(input: unknown) {
  const x = Schema.Struct({ a: Schema.String })
  return Schema.decodeUnknownResult(x)(input)
}`,
      filename: '/repo/pkg/src/decoder.ts',
    },
    {
      name: 'Should_Pass_When_ConstIsASchemaUseNotADeclaration',
      code: `import { Schema as S } from 'effect'
export const asToolInput = S.decodeUnknownOption(S.Record(S.String, S.Unknown))`,
      filename: '/repo/pkg/src/hook-payload.kernel.ts',
    },
    {
      name: 'Should_Pass_When_AliasedSchemaImportLivesInASchemaFile',
      code: `import { Schema as S } from 'effect'
export const U = S.Union([S.String, S.Number])`,
      filename: '/repo/pkg/src/domain.schema.ts',
    },
    {
      // A schema built inside a function is deliberately out of scope: the
      // produced value is created at call time and bound wherever the call
      // lands, so the placement obligation runs to module-scope bindings.
      // The rule's EXP/ACT copy says "module-scope" for exactly this reason.
      name: 'Should_Pass_When_AFunctionReturnsASchema',
      code: `import { Schema } from 'effect'
export const makeB = () => Schema.Struct({ value: Schema.Number })`,
      filename: '/repo/pkg/src/decide.ts',
    },
    {
      // The documented factory carve-out (route 14): the binding holds a
      // function, and the schema it would create is born at call time, bound
      // wherever the call lands — one file cannot attribute it.
      name: 'Should_Pass_When_AFactoryBindingReturnsASchema',
      code: `import { Schema as S } from 'effect'
export const makeZzByte = () => S.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // A codec use of a schema is not a declaration; a const bound to one is
      // silent by the rule's own claim.
      name: 'Should_Pass_When_ADecodeCodecConstIsBound',
      code: `import { Schema as S } from 'effect'
export const decodeControl = S.decodeSync(S.String)`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // `S.is(X)` returns a type guard over X — a use, not a declaration.
      name: 'Should_Pass_When_APredicateConstIsBound',
      code: `import { Schema as S } from 'effect'
export const isControl = S.is(S.String)`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // A local factory whose whole body is a non-schema object is a decided
      // non-schema: the resolver's null is undetermined, but the classifier
      // CAN see the body, so the call reads as an ordinary opaque value.
      name: 'Should_Pass_When_ALocalFactoryBuildsAPlainObject',
      code: `import { Schema as S } from 'effect'
const buildConfig = () => ({ env: 'prod', port: 8080 })
export const cfg = buildConfig()`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // A parameter is genuinely opaque: the rule cannot know what a
      // parameter-image produces, and the boundary between "cannot decide"
      // and "was already decided by the caller's module" is exactly why
      // parameters stay silent.
      name: 'Should_Pass_When_ALocalFactoryBlindlyReturnsItsParameter',
      code: `import { Schema as S } from 'effect'
const pick = (x: unknown) => x
export const chosen = pick(1)`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // A later non-schema write to a module-scope binding carries no
      // schema, exactly like a non-schema initializer.
      name: 'Should_Pass_When_ANonSchemaValueIsAssignedToALateBinding',
      code: `let n: number
n = 42
export { n }`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // A schema use inside a top-level block runs at import but is a use,
      // and stays silent like any other use.
      name: 'Should_Pass_When_ACodecUseSitsInsideATopLevelBlock',
      code: `import { Schema as S } from 'effect'
if (ENABLE) {
  const decodeControl = S.decodeSync(S.String)
  void decodeControl
}`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // A pattern default with a non-schema value carries no obligation.
      name: 'Should_Pass_When_APatternDefaultIsNotASchema',
      code: `const { zz = 42 } = {}
export { zz }`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // A value written into a local object and read back out is laundered
      // through a store this single file still sees, but through a combinator
      // (member write) the rule deliberately does not track: the documented
      // laundering non-decision. It stays silent and unclaimed.
      name: 'Should_Pass_When_AValueIsWrittenIntoAndReadFromALocalObject',
      code: `import { Schema as S } from 'effect'
const cfg: Record<string, unknown> = {}
cfg.value = 42
export const out = cfg.value`,
      filename: '/repo/pkg/src/hex.ts',
    },
    {
      // storybook-gherkin/src/Steps.ts — `export const Given = makeStepCtor('Given')`:
      // a curried step-DSL factory whose body cannot be folded. No vocabulary
      // base: the can't-decide is silent, not a report.
      name: 'Should_Pass_When_ADslKeywordIsAcurriedFactoryCall',
      code: `const makeStepCtor = (keyword: string): ((arg: unknown) => unknown) => {
  function ctor(statics: unknown): unknown { return statics }
  void keyword
  return ctor
}
export const Given: ((arg: unknown) => unknown) = makeStepCtor('Given')`,
      filename: '/repo/pkg/src/Steps.ts',
    },
    {
      // stryker-js/vitest-runner: `vitestTestRunnerFactory = createVitestTestRunnerFactory()` —
      // a module-local factory declaration with control flow in its body. The rule
      // cannot see a single return, has no vocabulary evidence, and stays silent.
      name: 'Should_Pass_When_ALocalFactoryDeclarationBuildsARunnerFactory',
      code: `function createVitestTestRunnerFactory(): unknown {
  const namespace = 'stryker'
  return () => ({ namespace })
}
export const vitestTestRunnerFactory = createVitestTestRunnerFactory()`,
      filename: '/repo/pkg/src/vitest-test-runner.ts',
    },
    {
      // stryker-js/plugin-api/src/core/StrykerCoreSchema.ts — a multi-statement
      // IIFE producing a JSON Schema document (a *use* of a schema, not a
      // declaration). The IIFE body does not fold and there is no evidence of a
      // schema construction here, so it is silent.
      name: 'Should_Pass_When_AMultiStatementIifeBuildsAJsonSchemaDocument',
      code: `import * as S from 'effect/Schema'
export const strykerCoreSchema: Record<string, unknown> = (() => {
  const document = S.toJsonSchemaDocument(S.Struct({ a: S.Number }))
  return Object.keys(document.definitions).length === 0 ? document.schema : document
})()`,
      filename: '/repo/pkg/src/core/StrykerCoreSchema.ts',
    },
    {
      // effect-atom/atom/src/Atom.ts — `export const runtime = context()`: a local
      // function declaration with a multi-statement body. No vocabulary evidence.
      name: 'Should_Pass_When_ARuntimeFactoryCallHasAnUnfoldableBody',
      code: `function context(): unknown {
  const memoMap = new Map<string, unknown>()
  return memoMap
}
export const runtime = context()`,
      filename: '/repo/pkg/src/Atom.ts',
    },
    {
      // effect-atom/atom/src/Browser.ts — `refreshOnWindowFocus = makeRefreshOnSignal(signal)`:
      // a local arrow factory with a block body that does not fold.
      name: 'Should_Pass_When_ACombinatorFactoryBodyDoesNotFold',
      code: `const makeRefreshOnSignal = (signal: unknown) => {
  const refresh = () => signal
  return refresh
}
export const refreshOnWindowFocus = makeRefreshOnSignal(window)`,
      filename: '/repo/pkg/src/Browser.ts',
    },
    {
      // effect-atom/atom/src/internal/Core.ts — `removeTtl = setIdleTTL(0)` where
      // setIdleTTL is itself built by another local call. The callee's origin
      // cannot be seen and there is no vocabulary evidence.
      name: 'Should_Pass_When_ACalleeBuiltByAnotherCallIsInvoked',
      code: `const makeDual = () => {
  const dual = (input: number): unknown => input
  return dual
}
const setIdleTTL = makeDual()
export const removeTtl = setIdleTTL(0)`,
      filename: '/repo/pkg/src/internal/Core.ts',
    },
    {
      // effect-cell-types/src/Cell.ts — `canonical = write(encode(decide(...)))`:
      // a chain of module-local phase constructors whose bodies the rule cannot fold.
      name: 'Should_Pass_When_ALocalConstructorChainBuildsACellDescription',
      code: `const write = (inner: unknown) => {
  const out = inner
  return out
}
const encode = (inner: unknown): unknown => inner
const decide = (inner: unknown): unknown => inner
const decode = (inner: unknown): unknown => inner
const read = (inner: unknown): unknown => inner
const canonicalDecide = (inner: unknown): unknown => inner
export const canonical = write(
  encode(
    decide(
      decode(read(null)),
      canonicalDecide,
    ),
  ),
)`,
      filename: '/repo/pkg/src/Cell.ts',
    },
    {
      // effect-cell-types/src/Cell.ts — `vocabulary` is an object whose members are
      // read off the local `canonical` value. The base is opaque, so every member
      // is opaque and the record is silent.
      name: 'Should_Pass_When_AnObjectRecordReadsMembersOfALocalValue',
      code: `import { Schema } from 'effect'
const canonical = Schema.Struct; // keep the import alive; the record itself is local
const WALKED = { a: canonical, b: canonical }
export const vocabulary = {
  module: WALKED.a,
  phases: [WALKED.b],
}
void vocabulary`,
      filename: '/repo/pkg/src/Cell.ts',
    },
    {
      // effect-cell-types/src/Wire.ts — `export const string = mint(S.String)`: the
      // callee `mint` is a local factory (multi-statement body) that marks a schema
      // member. A call into a builder is a can't-decide without vocabulary evidence
      // at the BASE; the S.* argument is a use, and the binding is silent.
      name: 'Should_Pass_When_ALocalMintFactoryWrapsASchemaMember',
      code: `import { Schema as S } from 'effect'
const assertMinted = (_field: unknown): void => {}
const mint = (field: unknown) => {
  assertMinted(field)
  return field
}
export const string = mint(S.String)
export const number = mint(S.Finite)`,
      filename: '/repo/pkg/src/Wire.ts',
    },
    {
      // effect-schema-law/src/BoundedUnion.ts — `Expr = boundedUnion('Expr', {...})`:
      // a helper that builds a codec union over base and recursive members. The local
      // builder's body does not fold; no positive evidence of a declaration here.
      name: 'Should_Pass_When_ALocalCodecBuilderIsInvoked',
      code: `const boundedUnion = (name: string, _parts: { base: readonly unknown[]; recur: readonly unknown[] }) => {
  const built = { name }
  return built
}
export const Expr = boundedUnion('Expr', { base: [], recur: [] })`,
      filename: '/repo/pkg/src/BoundedUnion.ts',
    },
    {
      // effect-schema-vite/tests/inline-schema-tests.integration.test.ts —
      // `NESTED = makePackage('schema-laws-', {...})`: a test fixture builder with
      // a real body (tempdir, files, loop). The rule cannot see a schema and must
      // not claim one.
      name: 'Should_Pass_When_ASuiteFixtureBuilderMonksAFilesystem',
      code: `const makePackage = (prefix: string, files: Record<string, string>): string => {
  const root = prefix
  for (const name of Object.keys(files)) {
    void name
  }
  return root
}
const NESTED = makePackage('schema-laws-', { 'nested/schemas.ts': 'x' })
const NAMESAKES = makePackage('schema-laws-namesake-', { 'money.schema.ts': 'y' })
export const fixtures = [NESTED, NAMESAKES]`,
      filename: '/repo/pkg/tests/inline-schema-tests.integration.test.ts',
    },
    {
      // arethetypeswrong/cli/src/main.ts — `program = main(argv).pipe(...)` where
      // `main` is itself a local value built by another call (`Command.runWith`).
      // Neither callee resolves; the pipeline is opaque end to end.
      name: 'Should_Pass_When_AProgramBuiltByAnotherCallIsPiped',
      code: `const command = (version: string) => {
  const run = (args: readonly string[]) => ({ args })
  return run
}
const main = command('1.0.0')
export const program = main(process.argv).pipe((value: unknown) => value)
export const provided = program.pipe((value: unknown) => value)`,
      filename: '/repo/pkg/src/main.ts',
    },
    {
      // effect-schema-law/src/Refutes.ts — the tree's sanctioned in-source fixture
      // guard is `if (import.meta.vitest !== void 0)`; the exemption keys on the
      // positive guard, so a fixture schema inside stays silent like the bare
      // `import.meta.vitest` spelling.
      name: 'Should_Pass_When_A_vitestBlockGuardIsSpelled_DoubleEqualsVoidZero',
      code: `import { Schema } from 'effect'
if (import.meta.vitest !== void 0) {
  const Hexish = Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]*$/)))
  const PRIMITIVE_BASES = [Schema.String, Schema['Number'], Schema.Boolean] as const
  void Hexish
  void PRIMITIVE_BASES
}`,
      filename: '/repo/pkg/src/Refutes.ts',
    },
    {
      // The mixed conditional is a can't-decide, but it is NOT unresolved: the
      // schema arm resolves and the other arm is decided — a value that MAY be a
      // schema with no vocabulary base at the decision point. Irresolution is not
      // evidence, so the binding is left to review and stays silent.
      name: 'Should_Pass_When_AConditionalMixesASchemaAndAPlainValue',
      code: `import { Schema as S } from 'effect'
export const maybe = ENABLED ? S.Struct({ a: S.Number }) : 42`,
      filename: '/repo/pkg/src/mixed.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ClassSchemaLivesInAKernelFile',
      code: `import { Schema } from 'effect'
export class StepError extends Schema.TaggedError<StepError>()('StepError', { message: Schema.String }) {}`,
      filename: '/repo/pkg/src/step-error.kernel.ts',
      errors: [error('StepError')],
    },
    {
      name: 'Should_Report_When_ConstSchemaLivesInATypesFile',
      code: `import { Schema } from 'effect'
export const U = Schema.Union([Schema.String, Schema.Number])`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('U')],
    },
    {
      name: 'Should_Report_When_AliasedConstSchemaLivesInATypesFile',
      code: `import { Schema as S } from 'effect'
export const U = S.Union([S.String, S.Number])`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('U')],
    },
    {
      name: 'Should_Report_When_ClassSchemaLivesInAWorkflowFileWithAnExtraPeriod',
      code: `import { Schema } from 'effect'
export class E extends Schema.TaggedError<E>()('E', { message: Schema.String }) {}`,
      filename: '/repo/pkg/src/foo.bar.workflow.ts',
      errors: [error('E')],
    },
    {
      // The spelling the old predicate could not see: a namespace import of the
      // submodule. It read as valid under a reader that only knew `{ Schema } from 'effect'`.
      name: 'Should_Report_When_NamespaceImportedSchemaLivesInAKernelFile',
      code: `import * as Schema from 'effect/Schema'
export const U = Schema.Union([Schema.String, Schema.Number])`,
      filename: '/repo/pkg/src/result.kernel.ts',
      errors: [error('U')],
    },
    {
      name: 'Should_Report_When_AliasedNamespaceSchemaClassLivesInAKernelFile',
      code: `import * as S_ from 'effect/Schema'
export class E extends S_.TaggedError<E>()('E', { message: S_.String }) {}`,
      filename: '/repo/pkg/src/result.kernel.ts',
      errors: [error('E')],
    },
    {
      // The local alias hides the Schema binding from a name-matching rule;
      // the resolver follows the alias chain to the import origin.
      name: 'Should_Report_When_AnAliasedSchemaLocalBuildsAConst',
      code: `import { Schema } from 'effect'
const S = Schema
export const B = S.Struct({ value: Schema.Number })`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('B')],
    },
    {
      name: 'Should_Report_When_AComputedKeyNamesTheSchemaMember',
      code: `import { Schema as S } from 'effect'
export const U = S['Union']([S.String, S.Number])`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('U')],
    },
    {
      // A destructured member is a new local, but it still denotes
      // `Schema.Struct`; the resolver walks the pattern back to the import.
      name: 'Should_Report_When_ASchemaMemberIsDestructuredFromTheNamespace',
      code: `import { Schema } from 'effect'
const { Struct } = Schema
export const B = Struct({ value: Schema.Number })`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('B')],
    },
    {
      // A namespace import of `effect` exposes `.Schema`; the resolver takes
      // the first member off the namespace and then the combinator.
      name: 'Should_Report_When_TheSchemaIsReachedThroughAnEffectNamespaceImport',
      code: `import * as E from 'effect'
export const B = E.Schema.Struct({ value: E.Schema.Number })`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('B')],
    },
    {
      // An `export default <call>` wraps a bare expression, not a declaration;
      // the anonymous schema still lives outside a schema file.
      name: 'Should_Report_When_TheSchemaIsAnAnonymousDefaultExport',
      code: `import { Schema as S } from 'effect'
export default S.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('default')],
    },
    {
      // Whichever branch runs, the binding holds a schema.
      name: 'Should_Report_When_AConditionalInitializesAConstToOneOfSeveralSchemas',
      code: `import { Schema as S } from 'effect'
export const P = flag ? S.String : S.Number`,
      filename: '/repo/pkg/src/types.ts',
      errors: [error('P')],
    },
    {
      // A class field initializer constructs the schema at definition time,
      // outside any function body; the class name makes the report addressable.
      name: 'Should_Report_When_AClassFieldInitializesASchema',
      code: `import { Schema as S } from 'effect'
export class Box { schema = S.Struct({ value: S.Number }) }`,
      filename: '/repo/pkg/src/box.ts',
      errors: [error('Box.schema')],
    },
    {
      // Route 1 — the resolver only followed `const` aliases; `let` parked
      // the same schema with zero findings.
      name: 'Should_Report_When_ALetAliasBuildsAConstOutsideASchemaFile',
      code: `import { Schema } from 'effect'
let S = Schema
export const ZzByte = S.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Route 2 — a comma sequence is an alias; the resolver read it as a
      // call-shaped value it could not follow.
      name: 'Should_Report_When_ACommaSequenceAliasBuildsAConst',
      code: `import { Schema } from 'effect'
const S = (0, Schema)
export const ZzByte = S.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Route 3 — the pattern walk skipped computed keys, so `['Struct']`
      // never named the member the alias bound.
      name: 'Should_Report_When_AComputedDestructureKeyAliasesTheMember',
      code: `import { Schema } from 'effect'
const { ['Struct']: Build } = Schema
export const ZzByte = Build({ value: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Route 4 — a TS wrapper around the initializer made the chain opaque.
      name: 'Should_Report_When_AnAsCastWrapsAConstSchema',
      code: `import { Schema as S } from 'effect'
export const ZzByte = S.Struct({ value: S.Number }) as unknown`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Route 4, satisfies spelling.
      name: 'Should_Report_When_ASatisfiesWrapsAConstSchema',
      code: `import { Schema as S } from 'effect'
export const ZzByte = S.Struct({ a: S.Number }) satisfies { readonly a: number }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Route 5 — thirteen chained aliases exceed the old resolver depth of
      // twelve; the depth ladder is a report now, and the chain itself
      // resolves with the raised cap.
      name: 'Should_Report_When_ASchemaIsHiddenBehindThirteenAliases',
      code: `import { Schema } from 'effect'
const a1 = Schema
const a2 = a1
const a3 = a2
const a4 = a3
const a5 = a4
const a6 = a5
const a7 = a6
const a8 = a7
const a9 = a8
const a10 = a9
const a11 = a10
const a12 = a11
const a13 = a12
export const ZzByte = a13.Struct({ value: Schema.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Route 6 — an IIFE: the call binds the produced value here and now,
      // so following the callee's body IS deciding the binding.
      name: 'Should_Report_When_AnIifeBuildsAConstSchema',
      code: `import * as S from 'effect/Schema'
export const x = (() => S.Struct({ a: S.Number }))()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      // Route 7 — an object wrapper holds a module-scope schema construction;
      // the binding is a declaration even though the object is not itself a
      // schema.
      name: 'Should_Report_When_AnObjectWrapperHoldsAConstSchema',
      code: `import { Schema as S } from 'effect'
export const x = { inner: S.Struct({ a: S.Number }) }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      // Route 8 — an array wrapper; same obligation as the object wrapper.
      name: 'Should_Report_When_AnArrayWrapperHoldsConstSchemas',
      code: `import { Schema as S } from 'effect'
export const x = [S.Struct({ a: S.Number }), S.String]`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      // Route 9 — a destructured declarator id binds a schema at module
      // scope; the visitor only read Identifier ids before.
      name: 'Should_Report_When_ADestructuredPatternBindsASchema',
      code: `import { Schema as S } from 'effect'
const { a } = S.Struct({ a: S.Number })
export const g = (): number => a.fields.a.value`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('a')],
    },
    {
      // Route 10 — an inline computed key that folds to a string names the
      // member; the two-literal concatenation is statically known. The
      // identifier-temp spelling `const m = 'Stru'+'ct'; S[m](...)` already
      // reported; only the inline shape escaped.
      name: 'Should_Report_When_AComputedStringConcatenationNamesTheMember',
      code: `import { Schema as S } from 'effect'
export const x = S['Stru' + 'ct']({ a: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      // Route 11 — `Symbol.for` names the well-known-symbol member; it is as
      // static as a string literal for resolving the chain.
      name: 'Should_Report_When_ASymbolForKeyNamesTheMember',
      code: `import { Schema as S } from 'effect'
export const x = S[Symbol.for('Struct')]({ a: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      // Route 12 — a module-local factory with a single-return body: the call
      // binds the schema here, so the factory's own body is followed and the
      // binding reports. The factory binding itself stays exempt (route 14).
      name: 'Should_Report_When_ALocalFactoriesResultIsBoundAtModuleScope',
      code: `import { Schema as S } from 'effect'
const makeSchema = (): unknown => S.Struct({ a: S.Number })
export const x = makeSchema()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('x')],
    },
    {
      // Route 13 — a class extends a call into a module-local factory whose body
      // builds the schema; the superclass chain is followed like a call.
      name: 'Should_Report_When_AClassExtendsALocalFactory',
      code: `import { Schema as S } from 'effect'
const extend = () => S.Struct({ a: S.Number })
class ZzProbeClass extends extend() {}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzProbeClass')],
    },
    {
      // Pin: parenthesized aliases were already transparent to the resolver;
      // the probe stays a report so the fix cannot regress it.
      name: 'Should_Report_When_AParenthesizedAliasBuildsAConst',
      code: `import { Schema } from 'effect'
const S = (Schema)
export const ZzByte = S.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Pin: a destructure default binds the member; already reported, kept
      // as a report.
      name: 'Should_Report_When_ADestructureDefaultAliasesTheMember',
      code: `import { Schema } from 'effect'
const { Struct = Schema.Struct } = Schema
export const ZzByte = Struct({ value: Schema.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('ZzByte')],
    },
    {
      // Fail-closed: a computed subscript with a local key cannot name the
      // member, and the base is the Schema vocabulary — a can't-decide a
      // smuggling route needs. The narrowed message says exactly that.
      name: 'Should_Report_Unresolved_When_AComputedKeyHidesTheMemberName',
      code: `import { Schema as S } from 'effect'
const m = 'Stru' + 'ct'
export const x = S[m]({ a: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      // Fail-closed: a module-local factory whose body is more than a single
      // return cannot be decided in one file; the binding may hold a schema.
      name: 'Should_Report_Unresolved_When_ALocalFactoryBodyCannotBeFolded',
      code: `import { Schema as S } from 'effect'
const makeSchema = () => {
  const t = S.Struct({ a: S.Number })
  return t
}
export const x = makeSchema()`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      // Fail-closed: a chain past the classification depth is a report, not
      // a pass — the ladder has no silent length.
      name: 'Should_Report_Unresolved_When_AnAliasChainExceedsTheResolutionDepth',
      code: `import { Schema } from 'effect'
${Array.from({ length: 70 }, (_, i) => `const a${i + 1} = ${i === 0 ? 'Schema' : `a${i}`}`).join('\n')}
export const x = a70.Struct({ value: Schema.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('x')],
    },
    {
      // Round-5 route 1: a later write to a module-scope binding is the same
      // construction as an initializer, but was invisible to an
      // initializer-only reader.
      name: 'Should_Report_When_ALaterAssignmentBindsASchemaAtModuleScope',
      code: `import { Schema as S } from 'effect'
let zz: typeof S.String
zz = S.Struct({ value: S.Number })
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      // Round-5 route 3: a top-level if-block runs at import; a schema
      // declared inside it ships exactly like a top-level declarator.
      name: 'Should_Report_When_ASchemaSitsInsideATopLevelIfBlock',
      code: `import { Schema as S } from 'effect'
if (ENABLE) {
  const zzInternal = S.Struct({ value: S.Number })
  void zzInternal
}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zzInternal')],
    },
    {
      // Round-5c: a top-level switch case body runs at import like any other
      // module-scope block.
      name: 'Should_Report_When_ASchemaSitsInsideATopLevelSwitchCase',
      code: `import { Schema as S } from 'effect'
switch (kind) {
  case 'a':
    const zzInternal = S.Struct({ value: S.Number })
    void zzInternal
    break
}`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zzInternal')],
    },
    {
      // Round-5c: a pattern default binds the schema when the source lacks
      // the key; the default expression is the construction that binds.
      name: 'Should_Report_When_APatternDefaultBindsASchema',
      code: `import { Schema as S } from 'effect'
const { zz = S.Struct({ value: S.Number }) } = {}
export { zz }`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [error('zz')],
    },
    {
      // Round-5b: a spread copy of the vocabulary is a schema-producing
      // handle, not plain data; the member access off it cannot be resolved
      // statically and reports.
      name: 'Should_Report_Unresolved_When_AVocabularySpreadCopyFeedsAMember',
      code: `import { Schema as S } from 'effect'
const ZzVocab = { ...S }
export const ZzByte = ZzVocab.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('ZzByte')],
    },
    {
      // Round-5b: `Object.assign` copies member-by-member; a vocabulary
      // argument propagates through it and the member read off the copy
      // reports.
      name: 'Should_Report_Unresolved_When_ObjectAssignCarriesTheVocabulary',
      code: `import { Schema as S } from 'effect'
const ZzVocab = Object.assign({}, S)
export const ZzByte = ZzVocab.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('ZzByte')],
    },
    {
      // Round-5b: a coalesce with the vocabulary as one arm is a
      // schema-producing handle — `[opaque, vocabulary]` must not fold to
      // opaque — and the member read off it reports unresolved.
      name: 'Should_Report_Unresolved_When_ACoalesceCarriesTheVocabulary',
      code: `import { Schema as S } from 'effect'
const ZzVocab = missing ?? S
export const ZzByte = ZzVocab.Struct({ value: S.Number })`,
      filename: '/repo/pkg/src/zz-byte.ts',
      errors: [unresolved('ZzByte')],
    },
  ],
})

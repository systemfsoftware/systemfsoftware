import { Effect, Match } from 'effect'
import * as HashSet from 'effect/HashSet'
import * as Option from 'effect/Option'
import {
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isPropertyAccessExpression,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
  isVariableStatement,
  SyntaxKind,
} from 'typescript/unstable/ast'
import type {
  CallExpression,
  Identifier,
  InterfaceDeclaration,
  Node,
  PropertyAccessExpression,
  SourceFile,
  TypeAliasDeclaration,
  VariableStatement,
} from 'typescript/unstable/ast'
import { API, SignatureKind, SymbolFlags } from 'typescript/unstable/async'
import type {
  Checker,
  IntersectionType,
  NodeHandle,
  Program,
  Project,
  Snapshot,
  Symbol as TsSymbol,
  Type,
  TypeReference,
  UnionType,
} from 'typescript/unstable/async'
import { anyOf, branch } from '../branch.js'
import {
  CONFORMANCE_EXPORT_PATH,
  CONFORMANCE_NAMESPACE_PATH,
  CONFORMANCE_PACKAGE,
  UNIT_KIND_NAMES,
  UNIT_KINDS,
} from './kind.js'
import type { UnitKind, UnitKindName } from './kind.js'
import { bodyOf, flatten, valueReferences } from './walk.js'

const CELL_BRAND_SYMBOL = 'CellTypeId'
const SERVICE_TAG_INTERFACE = 'Service'

export interface UnitDeclaration {
  readonly name: string
  readonly key: string
  readonly kind: UnitKindName
}

/** One enrolled module: what a stop rule must reach, and the kind it enrolls as. */
export interface UnitModule {
  readonly file: string
  readonly absolute: string
  readonly kind: UnitKindName
  readonly declarations: readonly UnitDeclaration[]
}

/** Where a `Conformance.stopped` call was made, for a reach record. */
export interface CallSite {
  readonly file: string
  readonly line: number
  readonly via: string
}

/** One `Conformance.stopped` call that reaches a unit. */
export interface Reach {
  readonly file: string
  readonly line: number
  readonly mode: 'direct' | 'through-declarations'
  readonly via: string
}

interface ReachedDeclaration {
  readonly handle: NodeHandle
  readonly file: string
}

interface Reached {
  readonly reached: ReachedDeclaration
  readonly call: CallSite
}

interface HandedDeclarations {
  readonly files: HashSet.HashSet<string>
  readonly seeds: readonly Reached[]
}

interface ConformanceSymbols {
  readonly receiver: TsSymbol
  readonly stopped: TsSymbol
}

type ModuleFate = 'direct' | 'transitive' | 'unlinked'

/** One package's run: where its sources are and the program to build over them. */
export interface ProgramCheck {
  readonly packageRoot: string
  readonly configPath: string
  readonly sourceFiles: readonly string[]
  readonly testFiles: readonly string[]
}

/** What a program built over one package's sources enrolled and linked. */
export interface Enrollment {
  readonly units: readonly UnitModule[]
  readonly reaches: ReadonlyMap<string, readonly Reach[]>
  readonly enrolled: number
  readonly linked: number
  readonly direct: number
  readonly transitive: number
  readonly unlinked: readonly UnitModule[]
}

const asked = <A>(thunk: () => Promise<A>): Effect.Effect<A> => Effect.promise(thunk)

const orEmpty = <A>(values: readonly A[] | undefined): readonly A[] =>
  Option.match(Option.fromUndefinedOr(values), { onNone: () => [], onSome: (found) => found })

const anyTrue = (checks: readonly Effect.Effect<boolean>[]): Effect.Effect<boolean> =>
  Effect.map(Effect.forEach(checks, (check) => check, { concurrency: 1 }), (results) => results.some((value) => value))

const inside = (path: string, dir: string): boolean => anyOf([path === dir, path.startsWith(`${dir}/`)])

const matches = (candidate: Option.Option<TsSymbol>, expected: TsSymbol): boolean =>
  Option.match(candidate, { onNone: () => false, onSome: (symbol) => symbol.id === expected.id })

const emptyHanded = (): HandedDeclarations => ({
  files: HashSet.empty<string>(),
  seeds: [],
})

const relativeTo = (root: string, file: string): string => {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/u, '')
  const normalizedFile = file.replaceAll('\\', '/')
  return branch({
    on: normalizedFile.startsWith(`${normalizedRoot}/`),
    yes: () => normalizedFile.slice(normalizedRoot.length + 1),
    no: () => normalizedFile,
  })
}

const callSiteOf = (source: SourceFile, call: CallExpression, via: string, root: string): CallSite => ({
  file: relativeTo(root, source.fileName),
  line: source.getLineAndCharacterOfPosition(call.expression.getStart(source)).line + 1,
  via,
})

const resolveAlias = (checker: Checker, symbol: TsSymbol): Effect.Effect<TsSymbol> =>
  branch({
    on: (symbol.flags & SymbolFlags.Alias) === 0,
    yes: () => Effect.succeed(symbol),
    no: () => asked(() => checker.getAliasedSymbol(symbol)),
  })

const memberOf = (checker: Checker, symbol: TsSymbol, name: string): Effect.Effect<Option.Option<TsSymbol>> =>
  Effect.map(asked(() => checker.getMemberInModuleExports(symbol, name)), Option.fromUndefinedOr)

const stepExport = (
  checker: Checker,
  symbol: TsSymbol,
  name: string,
  rest: readonly string[],
): Effect.Effect<Option.Option<TsSymbol>> =>
  Effect.flatMap(memberOf(checker, symbol, name), (member) =>
    Option.match(member, {
      onNone: () => Effect.succeedNone,
      onSome: (found) => Effect.flatMap(resolveAlias(checker, found), (next) => exportedSymbol(checker, next, rest)),
    }))

const exportedSymbol = (
  checker: Checker,
  symbol: TsSymbol,
  path: readonly string[],
): Effect.Effect<Option.Option<TsSymbol>> =>
  branch({
    on: path[0] === undefined,
    yes: () => Effect.succeedSome(symbol),
    no: () => stepExport(checker, symbol, path[0] ?? '', path.slice(1)),
  })

const symbolAt = (checker: Checker, node: Node): Effect.Effect<Option.Option<TsSymbol>> =>
  Effect.flatMap(
    asked(() => checker.getSymbolAtLocation(node)),
    (symbol) =>
      Option.match(Option.fromUndefinedOr(symbol), {
        onNone: () => Effect.succeedNone,
        onSome: (found) => Effect.asSome(resolveAlias(checker, found)),
      }),
  )

const symbolIsUnit = (checker: Checker, units: HashSet.HashSet<number>, node: Node): Effect.Effect<boolean> =>
  Effect.flatMap(symbolAt(checker, node), (symbol) =>
    Option.match(symbol, {
      onNone: () => Effect.succeed(false),
      onSome: (found) => Effect.map(resolveAlias(checker, found), (resolved) => HashSet.has(units, resolved.id)),
    }))

const namedSymbol = (type: Type): Effect.Effect<Option.Option<TsSymbol>> =>
  Effect.flatMap(asked(() => type.getAliasSymbol()), (alias) =>
    Option.match(Option.fromUndefinedOr(alias), {
      onNone: () => Effect.map(asked(() => type.getSymbol()), Option.fromUndefinedOr),
      onSome: (found) => Effect.succeedSome(found),
    }))

const isUnionType = (type: Type): type is UnionType => type.isUnionType()
const isIntersectionType = (type: Type): type is IntersectionType => type.isIntersectionType()
const isTypeReferenceType = (type: Type): type is TypeReference => type.isTypeReference()

const membersOf = (type: UnionType | IntersectionType): Effect.Effect<readonly Type[]> =>
  Effect.map(asked(() => type.getTypes()), orEmpty)

const unionMembers = (type: Type): Effect.Effect<readonly Type[]> =>
  Match.value(type).pipe(
    Match.when(isUnionType, (union) => membersOf(union)),
    Match.when(isIntersectionType, (intersection) => membersOf(intersection)),
    Match.orElse(() => Effect.succeed<readonly Type[]>([])),
  )

const carrierIsService = (carrier: TsSymbol): boolean => carrier.name === SERVICE_TAG_INTERFACE

const referencedArguments = (checker: Checker, type: TypeReference): Effect.Effect<readonly Type[]> =>
  Effect.flatMap(
    asked(() => type.getTarget()),
    (target) =>
      Effect.flatMap(asked(() => target.getSymbol()), (carrier) =>
        Option.match(Option.fromUndefinedOr(carrier), {
          onNone: () => Effect.succeed<readonly Type[]>([]),
          onSome: (found) =>
            branch({
              on: carrierIsService(found),
              yes: () => asked(() => checker.getTypeArguments(type)),
              no: () => Effect.succeed<readonly Type[]>([]),
            }),
        })),
  )

const serviceArguments = (checker: Checker, type: Type): Effect.Effect<readonly Type[]> =>
  Match.value(type).pipe(
    Match.when(isTypeReferenceType, (reference) => referencedArguments(checker, reference)),
    Match.orElse(() => Effect.succeed<readonly Type[]>([])),
  )

const nestedCarriesUnit = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  type: Type,
  visited: HashSet.HashSet<number>,
): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const members = yield* unionMembers(type)
    const arguments_ = yield* serviceArguments(checker, type)
    return yield* anyTrue([...members, ...arguments_].map((member) => carriesUnit(checker, units, member, visited)))
  })

const carriesUnit = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  type: Type,
  visited: HashSet.HashSet<number>,
): Effect.Effect<boolean> =>
  branch({
    on: HashSet.has(visited, type.id),
    yes: () => Effect.succeed(false),
    no: () =>
      Effect.flatMap(namedSymbol(type), (named) =>
        branch({
          on: Option.match(named, { onNone: () => false, onSome: (symbol) => HashSet.has(units, symbol.id) }),
          yes: () => Effect.succeed(true),
          no: () => nestedCarriesUnit(checker, units, type, HashSet.add(visited, type.id)),
        })),
  })

const returnedCarriesUnit = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  symbolType: Type,
): Effect.Effect<boolean> =>
  Effect.flatMap(asked(() => checker.getSignaturesOfType(symbolType, SignatureKind.Call)), (signatures) =>
    anyTrue(
      signatures.map((signature) =>
        Effect.flatMap(asked(() => checker.getReturnTypeOfSignature(signature)), (returned) =>
          Option.match(Option.fromUndefinedOr(returned), {
            onNone: () =>
              Effect.succeed(false),
            onSome: (found) => carriesUnit(checker, units, found, HashSet.empty<number>()),
          }))
      ),
    ))

const declarationIsUnit = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  symbol: TsSymbol,
): Effect.Effect<boolean> =>
  Effect.flatMap(
    asked(() => checker.getTypeOfSymbol(symbol)),
    (symbolType) =>
      Option.match(Option.fromUndefinedOr(symbolType), {
        onNone: () => Effect.succeed(false),
        onSome: (found) =>
          Effect.flatMap(carriesUnit(checker, units, found, HashSet.empty<number>()), (direct) =>
            branch({
              on: direct,
              yes: () => Effect.succeed(true),
              no: () => returnedCarriesUnit(checker, units, found),
            })),
      }),
  )

const declarationKind = (
  checker: Checker,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  symbol: TsSymbol,
): Effect.Effect<Option.Option<UnitKindName>> => firstKindOf(checker, kindSets, symbol, UNIT_KIND_NAMES)

const firstKindOf = (
  checker: Checker,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  symbol: TsSymbol,
  names: readonly UnitKindName[],
): Effect.Effect<Option.Option<UnitKindName>> =>
  Option.match(Option.fromUndefinedOr(names[0]), {
    onNone: () => Effect.succeedNone,
    onSome: (name) =>
      Effect.flatMap(declarationIsUnit(checker, kindSets[name], symbol), (isKind) =>
        branch({
          on: isKind,
          yes: () => Effect.succeedSome(name),
          no: () => firstKindOf(checker, kindSets, symbol, names.slice(1)),
        })),
  })

const identifierText = (name: Node): Option.Option<string> =>
  Match.value(name).pipe(
    Match.when(isIdentifier, (identifier) => Option.some(identifier.text)),
    Match.orElse((): Option.Option<string> => Option.none()),
  )

const declaresBrand = (statement: VariableStatement): boolean =>
  statement.declarationList.declarations.some((declaration) =>
    Option.match(identifierText(declaration.name), {
      onNone: () => false,
      onSome: (text) => text === CELL_BRAND_SYMBOL,
    })
  )

const aliasReferencesUnit = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  node: TypeAliasDeclaration,
): Effect.Effect<boolean> =>
  branch({
    on: anyOf([node.type.kind === SyntaxKind.IntersectionType, node.type.kind === SyntaxKind.UnionType]),
    yes: () =>
      anyTrue(
        flatten(node.type).filter(isTypeReferenceNode).map((reference) =>
          symbolIsUnit(checker, units, reference.typeName)
        ),
      ),
    no: () => Effect.succeed(false),
  })

const aliasIsKind = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  node: TypeAliasDeclaration,
): Effect.Effect<boolean> =>
  Effect.flatMap(symbolIsUnit(checker, units, node.name), (named) =>
    branch({
      on: named,
      yes: () => Effect.succeed(true),
      no: () => aliasReferencesUnit(checker, units, node),
    }))

const interfaceIsKind = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  node: InterfaceDeclaration,
): Effect.Effect<boolean> => symbolIsUnit(checker, units, node.name)

const statementIsKind = (checker: Checker, units: HashSet.HashSet<number>, statement: Node): Effect.Effect<boolean> =>
  Match.value(statement).pipe(
    Match.when(isVariableStatement, (declared) => Effect.succeed(declaresBrand(declared))),
    Match.when(isInterfaceDeclaration, (declared) => interfaceIsKind(checker, units, declared)),
    Match.when(isTypeAliasDeclaration, (declared) => aliasIsKind(checker, units, declared)),
    Match.orElse(() => Effect.succeed(false)),
  )

const isKindModule = (checker: Checker, units: HashSet.HashSet<number>, file: SourceFile): Effect.Effect<boolean> =>
  anyTrue(file.statements.map((statement) => statementIsKind(checker, units, statement)))

const declarationUnit = (
  checker: Checker,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  file: SourceFile,
  name: Identifier,
  pos: number,
): Effect.Effect<Option.Option<UnitDeclaration>> =>
  Effect.flatMap(symbolAt(checker, name), (symbol) =>
    Option.match(symbol, {
      onNone: () => Effect.succeedNone,
      onSome: (found) =>
        Effect.map(declarationKind(checker, kindSets, found), (kind) =>
          Option.map(kind, (resolved) => ({ name: name.text, key: `${file.fileName}:${pos}`, kind: resolved }))),
    }))

const namedDeclaration = (
  checker: Checker,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  file: SourceFile,
  name: Node | undefined,
  pos: number,
): Effect.Effect<Option.Option<UnitDeclaration>> =>
  Option.match(Option.fromUndefinedOr(name), {
    onNone: () => Effect.succeedNone,
    onSome: (found) =>
      Match.value(found).pipe(
        Match.when(isIdentifier, (identifier) => declarationUnit(checker, kindSets, file, identifier, pos)),
        Match.orElse((): Effect.Effect<Option.Option<UnitDeclaration>> => Effect.succeedNone),
      ),
  })

const functionUnits = (
  checker: Checker,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  file: SourceFile,
  statement: Node,
): Effect.Effect<readonly UnitDeclaration[]> =>
  Match.value(statement).pipe(
    Match.when(
      isFunctionDeclaration,
      (declared) => Effect.map(namedDeclaration(checker, kindSets, file, declared.name, declared.pos), Option.toArray),
    ),
    Match.orElse((): Effect.Effect<readonly UnitDeclaration[]> => Effect.succeed([])),
  )

const statementUnits = (
  checker: Checker,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  file: SourceFile,
  statement: Node,
): Effect.Effect<readonly UnitDeclaration[]> =>
  Match.value(statement).pipe(
    Match.when(
      isVariableStatement,
      (declared) =>
        Effect.map(
          Effect.forEach(
            declared.declarationList.declarations,
            (declaration) => namedDeclaration(checker, kindSets, file, declaration.name, declaration.pos),
            { concurrency: 1 },
          ),
          (found) => found.flatMap(Option.toArray),
        ),
    ),
    Match.orElse(() => functionUnits(checker, kindSets, file, statement)),
  )

const kindOfDeclarations = (declarations: readonly UnitDeclaration[]): UnitKindName =>
  Option.getOrElse(Option.map(Option.fromUndefinedOr(declarations[0]), (declaration) => declaration.kind), () => 'cell')

const moduleUnitFrom = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  root: string,
  file: SourceFile,
): Effect.Effect<Option.Option<UnitModule>> =>
  Effect.gen(function*() {
    const kind = yield* isKindModule(checker, units, file)
    const declarations = yield* branch({
      on: kind,
      yes: () => Effect.succeed<readonly UnitDeclaration[]>([]),
      no: () =>
        Effect.map(
          Effect.forEach(
            file.statements,
            (statement) => statementUnits(checker, kindSets, file, statement),
            { concurrency: 1 },
          ),
          (found) => found.flat(),
        ),
    })
    return branch({
      on: declarations.length === 0,
      yes: () => Option.none<UnitModule>(),
      no: () =>
        Option.some({
          file: relativeTo(root, file.fileName),
          absolute: file.fileName,
          kind: kindOfDeclarations(declarations),
          declarations,
        }),
    })
  })

const sourceOf = (program: Program, file: string): Effect.Effect<Option.Option<SourceFile>> =>
  Effect.map(asked(() => program.getSourceFile(file)), Option.fromUndefinedOr)

const moduleUnitOf = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  program: Program,
  root: string,
  file: string,
): Effect.Effect<Option.Option<UnitModule>> =>
  Effect.flatMap(sourceOf(program, file), (source) =>
    Option.match(source, {
      onNone: () => Effect.succeedNone,
      onSome: (parsed) => moduleUnitFrom(checker, units, kindSets, root, parsed),
    }))

const enrollModules = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  kindSets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>,
  program: Program,
  root: string,
  sourceFiles: readonly string[],
): Effect.Effect<readonly UnitModule[]> =>
  Effect.map(
    Effect.forEach(
      sourceFiles,
      (file) => moduleUnitOf(checker, units, kindSets, program, root, file),
      { concurrency: 1 },
    ),
    (found) => found.flatMap(Option.toArray),
  )

const shorthandNameOf = (node: Node | undefined): Option.Option<Identifier> =>
  Option.match(Option.fromUndefinedOr(node), {
    onNone: () => Option.none(),
    onSome: (found) =>
      Match.value(found).pipe(
        Match.when(isShorthandPropertyAssignment, (shorthand) =>
          Match.value(shorthand.name).pipe(
            Match.when(isIdentifier, (name) => Option.some(name)),
            Match.orElse((): Option.Option<Identifier> => Option.none()),
          )),
        Match.orElse((): Option.Option<Identifier> => Option.none()),
      ),
  })

const fallbackOf = (handle: NodeHandle): Option.Option<ReachedDeclaration> => Option.some({ handle, file: handle.path })

const fromRootDeclaration = (
  fallback: NodeHandle,
  symbol: TsSymbol,
): Effect.Effect<Option.Option<ReachedDeclaration>> =>
  Option.match(Option.fromUndefinedOr(symbol.valueDeclaration), {
    onNone: () => Effect.succeed(fallbackOf(fallback)),
    onSome: (root) => Effect.succeedSome({ handle: root, file: root.path }),
  })

const outerDeclarationAt = (
  checker: Checker,
  fallback: NodeHandle,
  name: Identifier,
): Effect.Effect<Option.Option<ReachedDeclaration>> =>
  Effect.flatMap(
    asked(() => checker.resolveName(name.text, SymbolFlags.Value, name)),
    (found) =>
      Option.match(Option.fromUndefinedOr(found), {
        onNone: () => Effect.succeed(fallbackOf(fallback)),
        onSome: (symbol) =>
          Effect.flatMap(resolveAlias(checker, symbol), (resolved) => fromRootDeclaration(fallback, resolved)),
      }),
  )

const shorthandDeclarationAt = (
  checker: Checker,
  project: Project,
  handle: NodeHandle,
): Effect.Effect<Option.Option<ReachedDeclaration>> =>
  Effect.flatMap(asked(() => handle.resolve(project)), (node) =>
    Option.match(shorthandNameOf(node), {
      onNone: () => Effect.succeed(fallbackOf(handle)),
      onSome: (name) => outerDeclarationAt(checker, handle, name),
    }))

const declarationAt = (
  checker: Checker,
  project: Project,
  handle: NodeHandle,
): Effect.Effect<Option.Option<ReachedDeclaration>> =>
  branch({
    on: handle.kind === SyntaxKind.ShorthandPropertyAssignment,
    yes: () => shorthandDeclarationAt(checker, project, handle),
    no: () => Effect.succeed(fallbackOf(handle)),
  })

const declarationOf = (
  checker: Checker,
  project: Project,
  symbol: TsSymbol,
): Effect.Effect<Option.Option<ReachedDeclaration>> =>
  Option.match(Option.fromUndefinedOr(symbol.valueDeclaration), {
    onNone: () => Effect.succeedNone,
    onSome: (handle) => declarationAt(checker, project, handle),
  })

const isConformanceStopped = (
  checker: Checker,
  access: PropertyAccessExpression,
  symbols: ConformanceSymbols,
): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const callee = yield* symbolAt(checker, access.name)
    const bound = yield* symbolAt(checker, access.expression)
    return anyOf([matches(callee, symbols.stopped), matches(bound, symbols.receiver)])
  })

const reachedOf = (
  checker: Checker,
  project: Project,
  reference: Identifier,
  packageDir: string,
): Effect.Effect<Option.Option<ReachedDeclaration>> =>
  Effect.flatMap(symbolAt(checker, reference), (symbol) =>
    Option.match(symbol, {
      onNone: () => Effect.succeedNone,
      onSome: (found) =>
        Effect.map(declarationOf(checker, project, found), (declaration) =>
          Option.filter(declaration, (candidate) => inside(candidate.file, packageDir))),
    }))

const reachedFromArguments = (
  checker: Checker,
  project: Project,
  source: SourceFile,
  call: CallExpression,
  arguments_: readonly Node[],
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Effect.map(
    Effect.forEach(
      arguments_.flatMap(valueReferences),
      (reference) =>
        Effect.map(
          reachedOf(checker, project, reference, packageDir),
          (found) =>
            Option.map(found, (declaration): Reached => ({
              reached: declaration,
              call: callSiteOf(source, call, reference.text, packageDir),
            })),
        ),
      { concurrency: 1 },
    ),
    (found) => {
      const seeds = found.flatMap(Option.toArray)
      return { files: HashSet.fromIterable(seeds.map((seed) => seed.reached.file)), seeds }
    },
  )

const stoppedArguments = (
  checker: Checker,
  project: Project,
  source: SourceFile,
  call: CallExpression,
  access: PropertyAccessExpression,
  symbols: ConformanceSymbols,
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Effect.flatMap(isConformanceStopped(checker, access, symbols), (isStopped) =>
    branch({
      on: isStopped,
      yes: () => reachedFromArguments(checker, project, source, call, call.arguments, packageDir),
      no: () => Effect.succeed(emptyHanded()),
    }))

const reachedFromCall = (
  checker: Checker,
  project: Project,
  source: SourceFile,
  call: CallExpression,
  symbols: ConformanceSymbols,
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Match.value(call.expression).pipe(
    Match.when(
      isPropertyAccessExpression,
      (access) => stoppedArguments(checker, project, source, call, access, symbols, packageDir),
    ),
    Match.orElse(() => Effect.succeed(emptyHanded())),
  )

const mergeHanded = (groups: readonly HandedDeclarations[]): HandedDeclarations => ({
  files: groups.reduce((union, group) => HashSet.union(union, group.files), HashSet.empty<string>()),
  seeds: groups.flatMap((group) => group.seeds),
})

const handedFromSource = (
  checker: Checker,
  project: Project,
  source: SourceFile,
  symbols: ConformanceSymbols,
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Effect.map(
    Effect.forEach(
      flatten(source).filter(isCallExpression),
      (call) => reachedFromCall(checker, project, source, call, symbols, packageDir),
      { concurrency: 1 },
    ),
    mergeHanded,
  )

const handedFromFile = (
  checker: Checker,
  program: Program,
  project: Project,
  file: string,
  symbols: ConformanceSymbols,
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Effect.flatMap(sourceOf(program, file), (source) =>
    Option.match(source, {
      onNone: () => Effect.succeed(emptyHanded()),
      onSome: (parsed) => handedFromSource(checker, project, parsed, symbols, packageDir),
    }))

const handedDeclarations = (
  checker: Checker,
  program: Program,
  project: Project,
  testFiles: readonly string[],
  symbols: ConformanceSymbols,
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Effect.map(
    Effect.forEach(
      testFiles,
      (file) => handedFromFile(checker, program, project, file, symbols, packageDir),
      { concurrency: 1 },
    ),
    mergeHanded,
  )

const referencedDeclarations = (
  checker: Checker,
  project: Project,
  body: Node | undefined,
  packageDir: string,
): Effect.Effect<readonly ReachedDeclaration[]> =>
  Option.match(Option.fromUndefinedOr(body), {
    onNone: () => Effect.succeed([]),
    onSome: (found) =>
      Effect.map(
        Effect.forEach(
          valueReferences(found),
          (reference) => reachedOf(checker, project, reference, packageDir),
          { concurrency: 1 },
        ),
        (declarations) => declarations.flatMap(Option.toArray),
      ),
  })

interface WalkStep {
  readonly linked: HashSet.HashSet<string>
  readonly next: readonly Reached[]
  readonly walked: readonly Reached[]
}

const outgoing = (
  checker: Checker,
  project: Project,
  keys: HashSet.HashSet<string>,
  packageDir: string,
  reached: Reached,
  linked: HashSet.HashSet<string>,
): Effect.Effect<WalkStep> =>
  Effect.flatMap(asked(() => reached.reached.handle.resolve(project)), (node) =>
    Effect.map(
      referencedDeclarations(checker, project, bodyOf(node), packageDir),
      (next) => {
        const counted = Option.match(Option.fromUndefinedOr(node), {
          onNone: () => false,
          onSome: (found) => HashSet.has(keys, `${reached.reached.file}:${found.pos}`),
        })
        return {
          linked: branch({ on: counted, yes: () => HashSet.add(linked, reached.reached.file), no: () => linked }),
          next: next.map((declaration): Reached => ({ reached: declaration, call: reached.call })),
          walked: branch({ on: counted, yes: (): readonly Reached[] => [reached], no: (): readonly Reached[] => [] }),
        }
      },
    ))

interface WalkResult {
  readonly linked: HashSet.HashSet<string>
  readonly walked: readonly Reached[]
}

const walkLinked = (
  checker: Checker,
  project: Project,
  keys: HashSet.HashSet<string>,
  packageDir: string,
  queue: readonly Reached[],
  linked: HashSet.HashSet<string>,
  visited: HashSet.HashSet<string>,
  walked: readonly Reached[],
): Effect.Effect<WalkResult> => {
  const [head, ...rest] = queue
  return Option.match(Option.fromUndefinedOr(head), {
    onNone: () => Effect.succeed({ linked, walked }),
    onSome: (reached) =>
      branch({
        on: HashSet.has(visited, `${reached.reached.file}:${reached.reached.handle.index}`),
        yes: () => walkLinked(checker, project, keys, packageDir, rest, linked, visited, walked),
        no: () =>
          Effect.flatMap(outgoing(checker, project, keys, packageDir, reached, linked), (step) =>
            walkLinked(
              checker,
              project,
              keys,
              packageDir,
              [...rest, ...step.next],
              step.linked,
              HashSet.add(visited, `${reached.reached.file}:${reached.reached.handle.index}`),
              [...walked, ...step.walked],
            )),
      }),
  })
}

const walk = (
  checker: Checker,
  project: Project,
  keys: HashSet.HashSet<string>,
  packageDir: string,
  seeds: readonly Reached[],
): Effect.Effect<WalkResult> =>
  walkLinked(checker, project, keys, packageDir, seeds, HashSet.empty<string>(), HashSet.empty<string>(), [])

const importSpecifiers = (source: SourceFile, packageName: string): readonly Node[] =>
  flatten(source)
    .filter(isImportDeclaration)
    .map((declaration) => declaration.moduleSpecifier)
    .filter((specifier) => isStringLiteral(specifier) && specifier.text === packageName)

const packageSymbolIn = (
  checker: Checker,
  program: Program,
  file: string,
  packageName: string,
): Effect.Effect<Option.Option<TsSymbol>> =>
  Effect.flatMap(sourceOf(program, file), (source) =>
    Option.match(source, {
      onNone: () => Effect.succeedNone,
      onSome: (parsed) =>
        Effect.map(
          Effect.forEach(importSpecifiers(parsed, packageName), (specifier) => symbolAt(checker, specifier), {
            concurrency: 1,
          }),
          (symbols) => Option.fromUndefinedOr(symbols.flatMap(Option.toArray)[0]),
        ),
    }))

const moduleSymbolOf = (
  checker: Checker,
  program: Program,
  files: readonly string[],
  packageName: string,
): Effect.Effect<Option.Option<TsSymbol>> =>
  Effect.map(
    Effect.forEach(files, (file) => packageSymbolIn(checker, program, file, packageName), { concurrency: 1 }),
    (found) => Option.fromUndefinedOr(found.flatMap(Option.toArray)[0]),
  )

const kindIdOf = (
  checker: Checker,
  program: Program,
  files: readonly string[],
  kind: UnitKind,
): Effect.Effect<Option.Option<number>> =>
  Effect.flatMap(moduleSymbolOf(checker, program, files, kind.packageName), (module) =>
    Option.match(module, {
      onNone: () => Effect.succeedNone,
      onSome: (symbol) =>
        Effect.map(exportedSymbol(checker, symbol, kind.exportPath), (found) => Option.map(found, (value) => value.id)),
    }))

const kindIdsOf = (
  checker: Checker,
  program: Program,
  files: readonly string[],
  name: UnitKindName,
): Effect.Effect<HashSet.HashSet<number>> =>
  Effect.map(
    Effect.forEach(UNIT_KINDS[name], (kind) => kindIdOf(checker, program, files, kind), { concurrency: 1 }),
    (ids) => HashSet.fromIterable(ids.flatMap(Option.toArray)),
  )

const unitKindSets = (
  checker: Checker,
  program: Program,
  files: readonly string[],
): Effect.Effect<Readonly<Record<UnitKindName, HashSet.HashSet<number>>>> =>
  Effect.all({
    cell: kindIdsOf(checker, program, files, 'cell'),
    blueprint: kindIdsOf(checker, program, files, 'blueprint'),
    handle: kindIdsOf(checker, program, files, 'handle'),
    medium: kindIdsOf(checker, program, files, 'medium'),
  })

const unionKinds = (sets: Readonly<Record<UnitKindName, HashSet.HashSet<number>>>): HashSet.HashSet<number> =>
  UNIT_KIND_NAMES.reduce((union, name) => HashSet.union(union, sets[name]), HashSet.empty<number>())

const conformanceExports = (
  checker: Checker,
  module: TsSymbol,
): Effect.Effect<Option.Option<ConformanceSymbols>> =>
  Effect.flatMap(
    exportedSymbol(checker, module, CONFORMANCE_NAMESPACE_PATH),
    (receiver) =>
      Effect.map(exportedSymbol(checker, module, CONFORMANCE_EXPORT_PATH), (stopped) =>
        Option.all({ receiver, stopped })),
  )

const conformanceSymbols = (
  checker: Checker,
  program: Program,
  files: readonly string[],
): Effect.Effect<Option.Option<ConformanceSymbols>> =>
  Effect.flatMap(moduleSymbolOf(checker, program, files, CONFORMANCE_PACKAGE), (module) =>
    Option.match(module, {
      onNone: () => Effect.succeedNone,
      onSome: (symbol) => conformanceExports(checker, symbol),
    }))

const reachesOf = (module: UnitModule, handed: HandedDeclarations, walked: readonly Reached[]): readonly Reach[] => {
  const direct = handed.seeds
    .filter((seed) => seed.reached.file === module.absolute)
    .map((seed): Reach => ({ file: seed.call.file, line: seed.call.line, mode: 'direct', via: seed.call.via }))
  const transitive = walked
    .filter((entry) => entry.reached.file === module.absolute)
    .filter((entry) => !HashSet.has(handed.files, entry.reached.file))
    .map((entry): Reach => ({
      file: entry.call.file,
      line: entry.call.line,
      mode: 'through-declarations',
      via: entry.call.via,
    }))
  return dedupeReaches([...direct, ...transitive])
}

const reachKey = (reach: Reach): string => `${reach.file}:${reach.line}:${reach.mode}:${reach.via}`

const dedupeReaches = (reaches: readonly Reach[]): readonly Reach[] =>
  Object.values(
    reaches.reduce<Record<string, Reach>>((byKey, reach) => ({ ...byKey, [reachKey(reach)]: reach }), {}),
  )

const fateOf = (module: UnitModule, handed: HandedDeclarations, walked: readonly Reached[]): ModuleFate => {
  const reaches = reachesOf(module, handed, walked)
  return branch({
    on: reaches.length === 0,
    yes: (): ModuleFate => 'unlinked',
    no: (): ModuleFate =>
      branch({
        on: reaches.some((reach) => reach.mode === 'direct'),
        yes: (): ModuleFate => 'direct',
        no: (): ModuleFate => 'transitive',
      }),
  })
}

const enrollmentFrom = (
  modules: readonly UnitModule[],
  handed: HandedDeclarations,
  walked: readonly Reached[],
): Enrollment => {
  const fates = modules.map((module) => ({
    module,
    reaches: reachesOf(module, handed, walked),
    fate: fateOf(module, handed, walked),
  }))
  const count = (fate: ModuleFate): number => fates.filter((entry) => entry.fate === fate).length
  const direct = count('direct')
  const transitive = count('transitive')
  const unlinked = fates
    .filter((entry) => entry.fate === 'unlinked')
    .map((entry) => entry.module)
    .sort((left, right) => left.file.localeCompare(right.file))
  const reaches = new Map<string, readonly Reach[]>(
    fates.map((entry) => [entry.module.absolute, entry.reaches] as const),
  )
  return {
    units: modules,
    reaches,
    enrolled: modules.length,
    linked: direct + transitive,
    direct,
    transitive,
    unlinked,
  }
}

const handedFor = (
  checker: Checker,
  program: Program,
  project: Project,
  input: ProgramCheck,
  conformance: Option.Option<ConformanceSymbols>,
): Effect.Effect<HandedDeclarations> =>
  Option.match(conformance, {
    onNone: () => Effect.succeed(emptyHanded()),
    onSome: (symbols) => handedDeclarations(checker, program, project, input.testFiles, symbols, input.packageRoot),
  })

const findingsOf = (project: Project, input: ProgramCheck): Effect.Effect<Enrollment> =>
  Effect.gen(function*() {
    const { checker, program } = project
    const files = [...input.sourceFiles, ...input.testFiles]
    const kindSets = yield* unitKindSets(checker, program, files)
    const units = unionKinds(kindSets)
    const conformance = yield* conformanceSymbols(checker, program, files)
    const modules = yield* enrollModules(checker, units, kindSets, program, input.packageRoot, input.sourceFiles)
    const keys = HashSet.fromIterable(
      modules.flatMap((module) => module.declarations.map((declaration) => declaration.key)),
    )
    const handed = yield* handedFor(checker, program, project, input, conformance)
    const walked = yield* walk(checker, project, keys, input.packageRoot, handed.seeds)
    return enrollmentFrom(modules, handed, walked.walked)
  })

const projectOf = (snapshot: Snapshot, configPath: string): Option.Option<Project> =>
  Option.fromUndefinedOr(
    snapshot.getProjects().find((candidate) => candidate.configFileName === configPath) ??
      snapshot.getProjects()[0],
  )

const closeProgram = (api: API, snapshot: Snapshot): Effect.Effect<void> =>
  Effect.andThen(asked(() => snapshot.dispose()), asked(() => api.close()))

/** Run the enrollment check over one package's sources and tests. */
export const checkProgram = (input: ProgramCheck): Effect.Effect<Option.Option<Enrollment>> =>
  Effect.gen(function*() {
    const api = new API()
    const snapshot = yield* asked(() => api.updateSnapshot({ openProjects: [input.configPath] }))
    return yield* Option.match(projectOf(snapshot, input.configPath), {
      onNone: () => Effect.succeedNone,
      onSome: (project) => Effect.asSome(findingsOf(project, input)),
    }).pipe(Effect.ensuring(closeProgram(api, snapshot)))
  })

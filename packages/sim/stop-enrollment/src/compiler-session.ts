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
import { anyOf, branch } from './branch.js'
import { bodyOf, flatten, valueReferences } from './node-walk.js'
import { UnlinkedUnit } from './StopEnrollmentFailure.schema.js'
import { CONFORMANCE_EXPORT_PATH, CONFORMANCE_NAMESPACE_PATH, CONFORMANCE_PACKAGE, UNIT_KINDS } from './unit-kind.js'
import type { UnitKind } from './unit-kind.js'

const CELL_BRAND_SYMBOL = 'CellTypeId'
const SERVICE_TAG_INTERFACE = 'Service'

interface UnitDeclaration {
  readonly name: string
  readonly key: string
}

interface ModuleUnit {
  readonly file: string
  readonly absolute: string
  readonly declarations: readonly UnitDeclaration[]
}

interface ReachedDeclaration {
  readonly handle: NodeHandle
  readonly file: string
}

interface HandedDeclarations {
  readonly files: HashSet.HashSet<string>
  readonly declarations: readonly ReachedDeclaration[]
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
export interface EnrollmentFindings {
  readonly enrolled: number
  readonly linked: number
  readonly direct: number
  readonly transitive: number
  readonly unlinked: readonly UnlinkedUnit[]
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
  declarations: [],
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
  units: HashSet.HashSet<number>,
  file: SourceFile,
  name: Identifier,
  pos: number,
): Effect.Effect<Option.Option<UnitDeclaration>> =>
  Effect.flatMap(symbolAt(checker, name), (symbol) =>
    Option.match(symbol, {
      onNone: () => Effect.succeedNone,
      onSome: (found) =>
        Effect.map(declarationIsUnit(checker, units, found), (isUnit) =>
          branch({
            on: isUnit,
            yes: () => Option.some({ name: name.text, key: `${file.fileName}:${pos}` }),
            no: () => Option.none<UnitDeclaration>(),
          })),
    }))

const namedDeclaration = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  file: SourceFile,
  name: Node | undefined,
  pos: number,
): Effect.Effect<Option.Option<UnitDeclaration>> =>
  Option.match(Option.fromUndefinedOr(name), {
    onNone: () => Effect.succeedNone,
    onSome: (found) =>
      Match.value(found).pipe(
        Match.when(isIdentifier, (identifier) => declarationUnit(checker, units, file, identifier, pos)),
        Match.orElse((): Effect.Effect<Option.Option<UnitDeclaration>> => Effect.succeedNone),
      ),
  })

const functionUnits = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  file: SourceFile,
  statement: Node,
): Effect.Effect<readonly UnitDeclaration[]> =>
  Match.value(statement).pipe(
    Match.when(
      isFunctionDeclaration,
      (declared) => Effect.map(namedDeclaration(checker, units, file, declared.name, declared.pos), Option.toArray),
    ),
    Match.orElse((): Effect.Effect<readonly UnitDeclaration[]> => Effect.succeed([])),
  )

const statementUnits = (
  checker: Checker,
  units: HashSet.HashSet<number>,
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
            (declaration) => namedDeclaration(checker, units, file, declaration.name, declaration.pos),
            { concurrency: 1 },
          ),
          (found) => found.flatMap(Option.toArray),
        ),
    ),
    Match.orElse(() => functionUnits(checker, units, file, statement)),
  )

const moduleUnitFrom = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  root: string,
  file: SourceFile,
): Effect.Effect<Option.Option<ModuleUnit>> =>
  Effect.gen(function*() {
    const kind = yield* isKindModule(checker, units, file)
    const declarations = yield* branch({
      on: kind,
      yes: () => Effect.succeed<readonly UnitDeclaration[]>([]),
      no: () =>
        Effect.map(
          Effect.forEach(
            file.statements,
            (statement) => statementUnits(checker, units, file, statement),
            { concurrency: 1 },
          ),
          (found) => found.flat(),
        ),
    })
    return branch({
      on: declarations.length === 0,
      yes: () => Option.none<ModuleUnit>(),
      no: () => Option.some({ file: relativeTo(root, file.fileName), absolute: file.fileName, declarations }),
    })
  })

const sourceOf = (program: Program, file: string): Effect.Effect<Option.Option<SourceFile>> =>
  Effect.map(asked(() => program.getSourceFile(file)), Option.fromUndefinedOr)

const moduleUnitOf = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  program: Program,
  root: string,
  file: string,
): Effect.Effect<Option.Option<ModuleUnit>> =>
  Effect.flatMap(sourceOf(program, file), (source) =>
    Option.match(source, {
      onNone: () => Effect.succeedNone,
      onSome: (parsed) => moduleUnitFrom(checker, units, root, parsed),
    }))

const enrollModules = (
  checker: Checker,
  units: HashSet.HashSet<number>,
  program: Program,
  root: string,
  sourceFiles: readonly string[],
): Effect.Effect<readonly ModuleUnit[]> =>
  Effect.map(
    Effect.forEach(sourceFiles, (file) => moduleUnitOf(checker, units, program, root, file), { concurrency: 1 }),
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
  arguments_: readonly Node[],
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Effect.map(
    Effect.forEach(
      arguments_.flatMap(valueReferences),
      (reference) => reachedOf(checker, project, reference, packageDir),
      { concurrency: 1 },
    ),
    (found) => {
      const declarations = found.flatMap(Option.toArray)
      return { files: HashSet.fromIterable(declarations.map((declaration) => declaration.file)), declarations }
    },
  )

const stoppedArguments = (
  checker: Checker,
  project: Project,
  call: CallExpression,
  access: PropertyAccessExpression,
  symbols: ConformanceSymbols,
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Effect.flatMap(isConformanceStopped(checker, access, symbols), (isStopped) =>
    branch({
      on: isStopped,
      yes: () => reachedFromArguments(checker, project, call.arguments, packageDir),
      no: () => Effect.succeed(emptyHanded()),
    }))

const reachedFromCall = (
  checker: Checker,
  project: Project,
  call: CallExpression,
  symbols: ConformanceSymbols,
  packageDir: string,
): Effect.Effect<HandedDeclarations> =>
  Match.value(call.expression).pipe(
    Match.when(
      isPropertyAccessExpression,
      (access) => stoppedArguments(checker, project, call, access, symbols, packageDir),
    ),
    Match.orElse(() => Effect.succeed(emptyHanded())),
  )

const mergeHanded = (groups: readonly HandedDeclarations[]): HandedDeclarations => ({
  files: groups.reduce((union, group) => HashSet.union(union, group.files), HashSet.empty<string>()),
  declarations: groups.flatMap((group) => group.declarations),
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
      (call) => reachedFromCall(checker, project, call, symbols, packageDir),
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
  readonly next: readonly ReachedDeclaration[]
}

const outgoing = (
  checker: Checker,
  project: Project,
  keys: HashSet.HashSet<string>,
  packageDir: string,
  reached: ReachedDeclaration,
  linked: HashSet.HashSet<string>,
): Effect.Effect<WalkStep> =>
  Effect.flatMap(asked(() => reached.handle.resolve(project)), (node) =>
    Effect.map(
      referencedDeclarations(checker, project, bodyOf(node), packageDir),
      (next) => ({
        linked: Option.match(Option.fromUndefinedOr(node), {
          onNone: () => linked,
          onSome: (found) =>
            branch({
              on: HashSet.has(keys, `${reached.file}:${found.pos}`),
              yes: () => HashSet.add(linked, reached.file),
              no: () => linked,
            }),
        }),
        next,
      }),
    ))

const walkLinked = (
  checker: Checker,
  project: Project,
  keys: HashSet.HashSet<string>,
  packageDir: string,
  queue: readonly ReachedDeclaration[],
  linked: HashSet.HashSet<string>,
  visited: HashSet.HashSet<string>,
): Effect.Effect<HashSet.HashSet<string>> => {
  const [head, ...rest] = queue
  return Option.match(Option.fromUndefinedOr(head), {
    onNone: () => Effect.succeed(linked),
    onSome: (reached) =>
      branch({
        on: HashSet.has(visited, `${reached.file}:${reached.handle.index}`),
        yes: () => walkLinked(checker, project, keys, packageDir, rest, linked, visited),
        no: () =>
          Effect.flatMap(outgoing(checker, project, keys, packageDir, reached, linked), (step) =>
            walkLinked(
              checker,
              project,
              keys,
              packageDir,
              [...rest, ...step.next],
              step.linked,
              HashSet.add(visited, `${reached.file}:${reached.handle.index}`),
            )),
      }),
  })
}

const linkedDeclarations = (
  checker: Checker,
  project: Project,
  keys: HashSet.HashSet<string>,
  packageDir: string,
  seeds: readonly ReachedDeclaration[],
): Effect.Effect<HashSet.HashSet<string>> =>
  walkLinked(checker, project, keys, packageDir, seeds, HashSet.empty<string>(), HashSet.empty<string>())

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

const unitSymbols = (
  checker: Checker,
  program: Program,
  files: readonly string[],
): Effect.Effect<HashSet.HashSet<number>> =>
  Effect.map(
    Effect.forEach(UNIT_KINDS, (kind) => kindIdOf(checker, program, files, kind), { concurrency: 1 }),
    (ids) => HashSet.fromIterable(ids.flatMap(Option.toArray)),
  )

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

const fateOf = (
  module: ModuleUnit,
  handed: HandedDeclarations,
  linked: HashSet.HashSet<string>,
): ModuleFate =>
  branch({
    on: HashSet.has(handed.files, module.absolute),
    yes: (): ModuleFate => 'direct',
    no: (): ModuleFate =>
      branch({
        on: HashSet.has(linked, module.absolute),
        yes: (): ModuleFate => 'transitive',
        no: (): ModuleFate => 'unlinked',
      }),
  })

const findingsFrom = (
  modules: readonly ModuleUnit[],
  handed: HandedDeclarations,
  linked: HashSet.HashSet<string>,
): EnrollmentFindings => {
  const fates = modules.map((module) => ({ module, fate: fateOf(module, handed, linked) }))
  const count = (fate: ModuleFate): number => fates.filter((entry) => entry.fate === fate).length
  const direct = count('direct')
  const transitive = count('transitive')
  const unlinked = fates
    .filter((entry) => entry.fate === 'unlinked')
    .map((entry) =>
      UnlinkedUnit.make({
        file: entry.module.file,
        declarations: entry.module.declarations.map((declaration) => declaration.name),
      })
    )
    .sort((left, right) => left.file.localeCompare(right.file))
  return { enrolled: modules.length, linked: direct + transitive, direct, transitive, unlinked }
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

const findingsOf = (project: Project, input: ProgramCheck): Effect.Effect<EnrollmentFindings> =>
  Effect.gen(function*() {
    const { checker, program } = project
    const files = [...input.sourceFiles, ...input.testFiles]
    const units = yield* unitSymbols(checker, program, files)
    const conformance = yield* conformanceSymbols(checker, program, files)
    const modules = yield* enrollModules(checker, units, program, input.packageRoot, input.sourceFiles)
    const keys = HashSet.fromIterable(
      modules.flatMap((module) => module.declarations.map((declaration) => declaration.key)),
    )
    const handed = yield* handedFor(checker, program, project, input, conformance)
    const linked = yield* linkedDeclarations(checker, project, keys, input.packageRoot, handed.declarations)
    return findingsFrom(modules, handed, linked)
  })

const projectOf = (snapshot: Snapshot, configPath: string): Option.Option<Project> =>
  Option.fromUndefinedOr(
    snapshot.getProjects().find((candidate) => candidate.configFileName === configPath) ??
      snapshot.getProjects()[0],
  )

const closeProgram = (api: API, snapshot: Snapshot): Effect.Effect<void> =>
  Effect.andThen(asked(() => snapshot.dispose()), asked(() => api.close()))

/** Run the enrollment check over one package's sources and tests. */
export const checkProgram = (input: ProgramCheck): Effect.Effect<Option.Option<EnrollmentFindings>> =>
  Effect.gen(function*() {
    const api = new API()
    const snapshot = yield* asked(() => api.updateSnapshot({ openProjects: [input.configPath] }))
    return yield* Option.match(projectOf(snapshot, input.configPath), {
      onNone: () => Effect.succeedNone,
      onSome: (project) => Effect.asSome(findingsOf(project, input)),
    }).pipe(Effect.ensuring(closeProgram(api, snapshot)))
  })

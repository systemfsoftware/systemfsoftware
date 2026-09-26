/**
 * Contract lane: the vendored semantics the analyzer rides on, each pinned against a reference computed from the
 * library's own public API or its published specification.
 *
 * Why this file exists: `src/analyzer/TypeScriptInternals.ts` reaches into compiler internals that carry no public
 * typings — declared for this package only in `src/analyzer/typescript-internal.d.ts`, alongside the `semver`
 * surface in `src/analyzer/semver.d.ts`. A prose warning in either file would be forgotten or broken by a refactor,
 * and a dependency upgrade that moves any of these semantics would make the analyzer silently regress. Each
 * scenario below states its assumption as an executed comparison, so this lane re-fires first
 * (compound-packs/boundary-testing/pin-dependency-semantics, clauses 1-3).
 *
 * Clause 4 (no internal smuggling): this file imports `typescript`, the vendored packages the engine depends on,
 * the testing utilities, and effect services. It imports no application module.
 *
 * The compiler scenarios compile a throwaway program in a scoped temporary root and remove it again, so the lane
 * also exercises the teardown shape the engine's own runs rely on.
 */
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { TextRange, TSDocConfiguration, TSDocParser } from '@microsoft/tsdoc'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { formatPatch, structuredPatch } from 'diff'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import { minimatch } from 'minimatch'
import * as semver from 'semver'
import { SourceMapConsumer } from 'source-map'
import * as ts from 'typescript'

const Feature = makeFeature({ it })

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
}

const entryModule = [
  'import { Widget } from "./other.js"',
  'export declare const widget: Widget',
  'export { Widget as Renamed }',
  'export interface Widget { readonly id: string }',
  'export class Holder { [Symbol.iterator]() { return this } }',
  'export namespace Outer { export interface Inner { readonly n: number } }',
].join('\n')

const fixtureModules: Readonly<Record<string, string>> = {
  'index.ts': entryModule,
  'other.ts': 'export interface Widget { readonly id: string }\n',
}

const orMissing = <A, B>(value: Option.Option<A>, present: (found: A) => B, missing: B): B =>
  Option.match(value, { onNone: () => missing, onSome: present })

const moduleSymbolOf = (program: ts.Program, entry: ts.SourceFile): Option.Option<ts.Symbol> =>
  Option.fromNullishOr(program.getTypeChecker().getSymbolAtLocation(entry))

const exportedIn = (
  program: ts.Program,
  entry: Option.Option<ts.SourceFile>,
  name: string,
): Option.Option<ts.Symbol> =>
  Option.flatMap(
    Option.flatMap(entry, (sourceFile) => moduleSymbolOf(program, sourceFile)),
    (moduleSymbol) =>
      Arr.findFirst(program.getTypeChecker().getExportsOfModule(moduleSymbol), (candidate) => candidate.name === name),
  )

const firstDeclarationIn = (symbol: Option.Option<ts.Symbol>): Option.Option<ts.Declaration> =>
  Option.flatMap(
    symbol,
    (found) =>
      Arr.head(Option.getOrElse(Option.fromNullishOr(found.declarations), (): ReadonlyArray<ts.Declaration> => [])),
  )

const ascendsByGeneratedPosition = (positions: ReadonlyArray<number>): boolean =>
  Arr.every(
    positions,
    (position, index) => position > Option.getOrElse(Arr.get(positions, index - 1), () => position - 1),
  )

/**
 * Compiles the fixture modules with a real on-disk program in a scoped temporary root — the same shape the engine
 * builds — and removes the root once `collect` has returned.
 */
const withProgram = <A>(
  collect: (program: ts.Program, entry: Option.Option<ts.SourceFile>) => A,
): Effect.Effect<A, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'api-extractor-dependency-contract-' })
      yield* Effect.forEach(
        Object.entries(fixtureModules),
        ([relative, contents]) =>
          Effect.gen(function*() {
            const absolute = path.join(root, relative)
            yield* fs.makeDirectory(path.dirname(absolute), { recursive: true })
            yield* fs.writeFileString(absolute, contents)
          }),
        { discard: true },
      )
      const entryPath = path.join(root, 'index.ts')
      const program = ts.createProgram([entryPath], compilerOptions)
      return collect(program, Option.fromNullishOr(program.getSourceFile(entryPath)))
    }),
  )

interface MappingItemSnapshot {
  readonly generatedLine: number
  readonly generatedColumn: number
  readonly originalLine: number
  readonly originalColumn: number
  readonly source: string
}

/** The one hand-written source map the lane decodes: `AAAA;AACA` maps generated 1:0 -> 1:0 and 2:0 -> 2:0. */
const sourceMapItems = (): {
  readonly generatedOrderConstant: number
  readonly originalOrderConstant: number
  readonly items: ReadonlyArray<MappingItemSnapshot>
  readonly ascendsByGeneratedPosition: boolean
} => {
  const consumer = new SourceMapConsumer({
    version: '3',
    sources: ['a.ts'],
    names: [],
    mappings: 'AAAA;AACA',
    file: 'generated.js',
  })
  const items: Array<MappingItemSnapshot> = []
  consumer.eachMapping(
    (mapping) =>
      items.push({
        generatedLine: mapping.generatedLine,
        generatedColumn: mapping.generatedColumn,
        originalLine: mapping.originalLine,
        originalColumn: mapping.originalColumn,
        source: mapping.source,
      }),
    undefined,
    SourceMapConsumer.GENERATED_ORDER,
  )
  return {
    generatedOrderConstant: SourceMapConsumer.GENERATED_ORDER,
    originalOrderConstant: SourceMapConsumer.ORIGINAL_ORDER,
    items,
    ascendsByGeneratedPosition: ascendsByGeneratedPosition(
      Arr.map(items, (item) => item.generatedLine * 1000 + item.generatedColumn),
    ),
  }
}

const commentText = '// line comment\n/* block comment */\n/**\n * jsdoc comment\n */\nexport declare const v: number\n'

const commentTextsFrom = (ranges: Option.Option<ReadonlyArray<ts.CommentRange>>): ReadonlyArray<string> =>
  Arr.map(
    Option.getOrElse(ranges, (): ReadonlyArray<ts.CommentRange> => []),
    (range) => commentText.slice(range.pos, range.end),
  )

const commentRangesObservation = (): {
  readonly jsdocTexts: ReadonlyArray<string>
  readonly leadingCommentTexts: ReadonlyArray<string>
  readonly jsdocIsAbsentWithoutADocComment: boolean
} => {
  const sourceFile = ts.createSourceFile('comments.ts', commentText, ts.ScriptTarget.ES2022, true)
  const plainText = 'export declare const w: number\n'
  const plainSourceFile = ts.createSourceFile('plain.ts', plainText, ts.ScriptTarget.ES2022, true)
  return {
    jsdocTexts: commentTextsFrom(
      Option.flatMap(
        Arr.head(sourceFile.statements),
        (node) => Option.fromNullishOr(ts.getJSDocCommentRanges(node, commentText)),
      ),
    ),
    leadingCommentTexts: commentTextsFrom(
      Option.flatMap(
        Arr.head(sourceFile.statements),
        (node) => Option.fromNullishOr(ts.getLeadingCommentRanges(commentText, node.getFullStart())),
      ),
    ),
    jsdocIsAbsentWithoutADocComment: orMissing(
      Arr.head(plainSourceFile.statements),
      (node) => ts.getJSDocCommentRanges(node, plainText) === undefined,
      false,
    ),
  }
}

const tsdocObservation = (): {
  readonly firstRange: string
  readonly secondRange: string
  readonly firstModifierTags: ReadonlyArray<string>
  readonly secondModifierTags: ReadonlyArray<string>
} => {
  const parser = new TSDocParser(new TSDocConfiguration())
  const commentEnd = (text: string): number => text.indexOf('*/') + 2
  const firstText = '/**\n * First.\n * @public\n */\nexport declare const a: number\n'
  const secondText = '/**\n * Second.\n * @beta\n */\nexport declare const b: number\n'
  const first = parser.parseRange(TextRange.fromStringRange(firstText, 0, commentEnd(firstText)))
  const second = parser.parseRange(TextRange.fromStringRange(secondText, 0, commentEnd(secondText)))
  return {
    firstRange: first.sourceRange.toString(),
    secondRange: second.sourceRange.toString(),
    firstModifierTags: Arr.map(first.docComment.modifierTagSet.nodes, (tag) => tag.tagName),
    secondModifierTags: Arr.map(second.docComment.modifierTagSet.nodes, (tag) => tag.tagName),
  }
}

const unifiedPatchObservation = (): {
  readonly separatorIsEquals: boolean
  readonly separatorLength: number
  readonly fileHeaders: ReadonlyArray<string>
  readonly hunkHeader: string
  readonly hunkLines: ReadonlyArray<string>
  readonly hunks: ReadonlyArray<{
    readonly oldStart: number
    readonly oldLines: number
    readonly newStart: number
    readonly newLines: number
  }>
} => {
  const patch = structuredPatch('etc/a.api.md', 'temp/a.api.md', 'one\ntwo\n', 'one\nTWO\n')
  const lines = formatPatch(patch).split('\n')
  const separator = Option.getOrElse(Arr.head(lines), () => '')
  return {
    separatorIsEquals: /^=+$/.test(separator),
    separatorLength: separator.length,
    fileHeaders: lines.slice(1, 3),
    hunkHeader: Option.getOrElse(Arr.get(lines, 3), () => ''),
    hunkLines: lines.slice(4, 7),
    hunks: Arr.map(patch.hunks, (hunk) => ({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
    })),
  }
}

Feature('Pinning the vendored semantics the analyzer rides on')
  .live('the lane compiles real programs, decodes the vendored libraries and reads the compiler the manifest pins')
  .withLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'Distinct exported symbols keep distinct, stable, positive ids',
      Gherkin.Do.pipe(
        When('the compiler hands back an id for every symbol the public module lookup exports')(
          'ids',
          () =>
            // Relied on by ast-symbol-table.ts (HashMaps keyed by SymbolId) and export-analyzer.ts:242.
            withProgram((program, entry) =>
              orMissing(
                Option.flatMap(entry, (sourceFile) => moduleSymbolOf(program, sourceFile)),
                (moduleSymbol) => {
                  const exported = program.getTypeChecker().getExportsOfModule(moduleSymbol)
                  const ids = Arr.map(exported, (symbol) => ts.getSymbolId(symbol))
                  return {
                    names: Arr.sort(Arr.map(exported, (symbol) => symbol.name), Order.String),
                    distinct: new Set(ids).size === ids.length,
                    stable: Arr.every(exported, (symbol, index) => ts.getSymbolId(symbol) === ids[index]),
                    positive: Arr.every(ids, (id) => id > 0),
                  }
                },
                { names: [], distinct: false, stable: false, positive: false },
              )
            ),
        ),
        Then('the ids form a bijection over those symbols')(
          (s, expect) =>
            expect(s.ids).toEqual({
              names: ['Holder', 'Outer', 'Renamed', 'Widget', 'widget'],
              distinct: true,
              stable: true,
              positive: true,
            }),
        ),
      ),
    )

    scenario(
      'Distinct nodes keep distinct and stable ids',
      Gherkin.Do.pipe(
        When('the compiler hands back an id for every node the public child traversal reaches')(
          'ids',
          () =>
            // Relied on by ast-symbol-table.ts:327/401/498/565 and analysis-snapshot.ts:324 (HashMaps keyed by NodeId).
            withProgram((program, entry) =>
              orMissing(
                entry,
                (sourceFile) => {
                  const collected: Array<ts.Node> = []
                  const visit = (node: ts.Node): void => {
                    collected.push(node)
                    ts.forEachChild(node, visit)
                  }
                  ts.forEachChild(sourceFile, visit)
                  const ids = Arr.map(collected, (node) => ts.getNodeId(node))
                  return {
                    moreThanOneNode: collected.length > 1,
                    distinct: new Set(ids).size === ids.length,
                    stable: Arr.every(collected, (node, index) => ts.getNodeId(node) === ids[index]),
                  }
                },
                { moreThanOneNode: false, distinct: false, stable: false },
              )
            ),
        ),
        Then('the ids form a bijection over those nodes')((s, expect) =>
          expect(s.ids).toEqual({ moreThanOneNode: true, distinct: true, stable: true })
        ),
      ),
    )

    scenario(
      'A declaration symbol reports no check flags while a resolved member symbol carries the late flag',
      Gherkin.Do.pipe(
        When('the compiler reports the check flags and transience of a declared type and its property')(
          'flags',
          () =>
            // Relied on by TypeScriptInternals.ts:59: isLateBoundSymbol reads the transient flag and the check-flag
            // bitfield together, so a declaration symbol must report no flags and a resolved member the Late bit.
            withProgram((program, entry) =>
              orMissing(
                entry,
                () => {
                  const checker = program.getTypeChecker()
                  const resolvedMember = Option.flatMap(
                    exportedIn(program, entry, 'Holder'),
                    (symbol) => Arr.head(checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))),
                  )
                  const widget = exportedIn(program, entry, 'Widget')
                  return {
                    lateFlagIsOneBit: (ts.CheckFlags.Late & (ts.CheckFlags.Late - 1)) === 0,
                    lateFlagIsPositive: ts.CheckFlags.Late > 0,
                    declarationSymbolCheckFlags: orMissing(widget, (symbol) => ts.getCheckFlags(symbol), -1),
                    declarationSymbolTransient: Option.exists(
                      widget,
                      (symbol) => (symbol.flags & ts.SymbolFlags.Transient) !== 0,
                    ),
                    resolvedMemberTransient: Option.exists(
                      resolvedMember,
                      (symbol) => (symbol.flags & ts.SymbolFlags.Transient) !== 0,
                    ),
                    resolvedMemberCarriesTheLateFlag: Option.exists(
                      resolvedMember,
                      (symbol) => (ts.getCheckFlags(symbol) & ts.CheckFlags.Late) !== 0,
                    ),
                  }
                },
                {
                  lateFlagIsOneBit: false,
                  lateFlagIsPositive: false,
                  declarationSymbolCheckFlags: -1,
                  declarationSymbolTransient: true,
                  resolvedMemberTransient: false,
                  resolvedMemberCarriesTheLateFlag: false,
                },
              )
            ),
        ),
        Then('the late flag is one positive bit, absent on the declaration and present on the member')(
          (s, expect) =>
            expect(s.flags).toEqual({
              lateFlagIsOneBit: true,
              lateFlagIsPositive: true,
              declarationSymbolCheckFlags: 0,
              declarationSymbolTransient: false,
              resolvedMemberTransient: true,
              resolvedMemberCarriesTheLateFlag: true,
            }),
        ),
      ),
    )

    scenario(
      'The reported comment ranges are the jsdoc comments alone, in document order',
      Gherkin.Do.pipe(
        When('the compiler reports the jsdoc ranges and the public leading comments of one declaration')(
          'ranges',
          () =>
            // Relied on by metadata-helpers.ts:164, which takes the LAST range the internal call returns: that only
            // holds while the call filters every non-jsdoc leading comment out.
            Effect.sync(commentRangesObservation),
        ),
        Then('only the jsdoc comment is reported, while the public call sees all three comments')(
          (s, expect) =>
            expect(s.ranges).toEqual({
              jsdocTexts: ['/**\n * jsdoc comment\n */'],
              leadingCommentTexts: ['// line comment', '/* block comment */', '/**\n * jsdoc comment\n */'],
              jsdocIsAbsentWithoutADocComment: true,
            }),
        ),
      ),
    )

    scenario(
      'A resolved module is keyed by the mode the public usage location reports for that import',
      Gherkin.Do.pipe(
        When('the compiler resolves an import by the mode of its usage location and by other modes')(
          'resolution',
          () =>
            // Relied on by export-analyzer.ts:143 and :1297/1353: the engine reports the mode through
            // getModeForUsageLocation and hands that same value to Program.getResolvedModule.
            withProgram((program, entry) =>
              orMissing(
                entry,
                (sourceFile) => {
                  const specifier = './other.js'
                  const usage = Option.filter(
                    Option.flatMap(
                      Arr.findFirst(sourceFile.statements, ts.isImportDeclaration),
                      (declaration) => Option.fromNullishOr(declaration.moduleSpecifier),
                    ),
                    ts.isStringLiteralLike,
                  )
                  const reportedMode = Option.map(
                    usage,
                    (literal) => ts.getModeForUsageLocation(sourceFile, literal, compilerOptions),
                  )
                  const entryOf = (mode: ts.ResolutionMode) =>
                    Option.fromNullishOr(program.getResolvedModule(sourceFile, specifier, mode))
                  const publiclyResolved = Option.flatMap(
                    Option.fromNullishOr(
                      ts.resolveModuleName(
                        specifier,
                        sourceFile.fileName,
                        compilerOptions,
                        ts.createCompilerHost(compilerOptions),
                      ).resolvedModule,
                    ),
                    (resolved) => Option.some(resolved.resolvedFileName),
                  )
                  const entryForTheReportedMode = Option.flatMap(reportedMode, entryOf)
                  const resolvedForTheReportedMode = Option.flatMap(
                    entryForTheReportedMode,
                    (found) => Option.fromNullishOr(found.resolvedModule),
                  )
                  const others: ReadonlyArray<ts.ResolutionMode> = [
                    undefined,
                    ts.ModuleKind.CommonJS,
                    ts.ModuleKind.ESNext,
                  ]
                  const reported = Option.getOrUndefined(reportedMode)
                  const otherModesThatHit = Arr.filter(
                    others,
                    (mode) => mode !== reported && Option.isSome(entryOf(mode)),
                  )
                  return {
                    everyOtherModeMisses: otherModesThatHit.length === 0,
                    theReportedModeHits: Option.isSome(entryForTheReportedMode),
                    entryFieldNames: entryForTheReportedMode.pipe(
                      Option.map((entry) => Arr.sort(Object.keys(entry), Order.String)),
                      Option.getOrElse((): ReadonlyArray<string> => []),
                    ),
                    resolvedFileNameAgreesWithThePublicResolver: Option.exists(
                      resolvedForTheReportedMode,
                      (resolved) => Option.contains(publiclyResolved, resolved.resolvedFileName),
                    ),
                    theImportIsInternal: Option.exists(
                      resolvedForTheReportedMode,
                      (resolved) => resolved.isExternalLibraryImport === false,
                    ),
                  }
                },
                {
                  everyOtherModeMisses: false,
                  theReportedModeHits: false,
                  entryFieldNames: [],
                  resolvedFileNameAgreesWithThePublicResolver: false,
                  theImportIsInternal: false,
                },
              )
            ),
        ),
        Then('only the reported mode answers, with the entry shape and file the public resolver names')(
          (s, expect) =>
            expect(s.resolution).toEqual({
              everyOtherModeMisses: true,
              theReportedModeHits: true,
              entryFieldNames: [
                'affectingLocations',
                'alternateResult',
                'failedLookupLocations',
                'resolutionDiagnostics',
                'resolvedModule',
              ],
              resolvedFileNameAgreesWithThePublicResolver: true,
              theImportIsInternal: true,
            }),
        ),
      ),
    )

    scenario(
      'The resolver agrees with the public global lookup about which names are global',
      Gherkin.Do.pipe(
        When('the resolver and the public lookup are asked about a global name and an absent one')(
          'names',
          () =>
            // Relied on by unique-names-phase.ts:70 (emitted names must avoid globals) and ast-symbol-table.ts:699
            // (an unfollowable identifier is a global reference only when the resolver says so).
            withProgram((program, entry) =>
              orMissing(
                entry,
                () => {
                  const checker = program.getTypeChecker()
                  const resolver = checker.getEmitResolver()
                  const byPublicLookup = (name: string): boolean =>
                    checker.resolveName(name, undefined, ts.SymbolFlags.Value, false) !== undefined
                  return {
                    resolverFindsArray: resolver.hasGlobalName('Array'),
                    publicLookupFindsArray: byPublicLookup('Array'),
                    resolverFindsNoSuchName: resolver.hasGlobalName('DefinitelyNotAGlobalName'),
                    publicLookupFindsNoSuchName: byPublicLookup('DefinitelyNotAGlobalName'),
                  }
                },
                {
                  resolverFindsArray: false,
                  publicLookupFindsArray: false,
                  resolverFindsNoSuchName: true,
                  publicLookupFindsNoSuchName: true,
                },
              )
            ),
        ),
        Then('both agree on the global and on the absent name')((s, expect) =>
          expect(s.names).toEqual({
            resolverFindsArray: true,
            publicLookupFindsArray: true,
            resolverFindsNoSuchName: false,
            publicLookupFindsNoSuchName: false,
          })
        ),
      ),
    )

    scenario(
      'A nested symbol is chained to the enclosing symbol through its parent',
      Gherkin.Do.pipe(
        When('the compiler reports the parent of a symbol exported from a namespace')(
          'parents',
          () =>
            // Relied on by export-analyzer.ts:166, which walks up from a module symbol to the enclosing value module.
            withProgram((program, entry) =>
              orMissing(
                entry,
                () => {
                  const outer = exportedIn(program, entry, 'Outer')
                  const inner = Option.flatMap(outer, (symbol) =>
                    Arr.findFirst(
                      program.getTypeChecker().getExportsOfModule(symbol),
                      (candidate) => candidate.name === 'Inner',
                    ))
                  return {
                    parentIsTheEnclosingSymbol: Option.exists(
                      inner,
                      (symbol) => symbol.parent === Option.getOrUndefined(outer),
                    ),
                    parentName: orMissing(
                      Option.flatMap(inner, (symbol) => Option.fromNullishOr(symbol.parent)),
                      (parent) => parent.name,
                      '',
                    ),
                  }
                },
                { parentIsTheEnclosingSymbol: false, parentName: '' },
              )
            ),
        ),
        Then('the parent is the namespace symbol itself')((s, expect) =>
          expect(s.parents).toEqual({ parentIsTheEnclosingSymbol: true, parentName: 'Outer' })
        ),
      ),
    )

    scenario(
      'A declaration symbol differs from the local symbol a declaration was written as',
      Gherkin.Do.pipe(
        When('the compiler reports the symbol and the local symbol of a declaration and of a re-export')(
          'symbols',
          () =>
            // Relied on by ast-symbol-table.ts:87: the declaration's written name comes from `declaration.localSymbol`.
            withProgram((program, entry) =>
              orMissing(
                entry,
                () => {
                  const widget = exportedIn(program, entry, 'Widget')
                  const renamed = exportedIn(program, entry, 'Renamed')
                  const widgetDeclaration = firstDeclarationIn(widget)
                  return {
                    declarationSymbolIsTheExportedSymbol: Option.exists(
                      widgetDeclaration,
                      (declaration) => declaration.symbol === Option.getOrUndefined(widget),
                    ),
                    localSymbolNameOfTheDeclaration: orMissing(
                      Option.flatMap(widgetDeclaration, (declaration) => Option.fromNullishOr(declaration.localSymbol)),
                      (symbol) => symbol.name,
                      '',
                    ),
                    renamedCarriesTheAliasFlag: Option.exists(
                      renamed,
                      (symbol) => (symbol.flags & ts.SymbolFlags.Alias) !== 0,
                    ),
                    renamedDeclarationSymbolName: orMissing(
                      Option.flatMap(
                        firstDeclarationIn(renamed),
                        (declaration) => Option.fromNullishOr(declaration.symbol),
                      ),
                      (symbol) => symbol.name,
                      '',
                    ),
                    renamedDeclarationHasNoLocalSymbol: Option.exists(
                      firstDeclarationIn(renamed),
                      (declaration) => declaration.localSymbol === undefined,
                    ),
                  }
                },
                {
                  declarationSymbolIsTheExportedSymbol: false,
                  localSymbolNameOfTheDeclaration: '',
                  renamedCarriesTheAliasFlag: false,
                  renamedDeclarationSymbolName: '',
                  renamedDeclarationHasNoLocalSymbol: false,
                },
              )
            ),
        ),
        Then('the plain declaration reports itself for both fields, and the re-export names the alias')(
          (s, expect) =>
            expect(s.symbols).toEqual({
              declarationSymbolIsTheExportedSymbol: true,
              localSymbolNameOfTheDeclaration: 'Widget',
              renamedCarriesTheAliasFlag: true,
              renamedDeclarationSymbolName: 'Renamed',
              renamedDeclarationHasNoLocalSymbol: true,
            }),
        ),
      ),
    )

    scenario(
      'A computed member carries the well-known computed marker, and its name resolves to another symbol',
      Gherkin.Do.pipe(
        When('the compiler reports the escaped name of a computed member and the symbol at its name')(
          'computed',
          () =>
            // Relied on by TypeScriptInternals.ts:47: the engine recognizes a computed declaration by comparing the
            // symbol's escaped name with InternalSymbolName.Computed, then asks the checker for a better symbol.
            withProgram((program, entry) =>
              orMissing(
                entry,
                () => {
                  const member = Option.flatMap(
                    Option.filter(firstDeclarationIn(exportedIn(program, entry, 'Holder')), ts.isClassDeclaration),
                    (declaration) => Arr.head(declaration.members),
                  )
                  const symbolAtTheName = Option.flatMap(
                    Option.flatMap(member, (element) => Option.fromNullishOr(ts.getNameOfDeclaration(element))),
                    (name) => Option.fromNullishOr(program.getTypeChecker().getSymbolAtLocation(name)),
                  )
                  return {
                    computedMarker: String(ts.InternalSymbolName.Computed),
                    memberCarriesTheMarkerAsItsEscapedName: Option.exists(
                      Option.flatMap(member, (element) => Option.fromNullishOr(element.symbol)),
                      (symbol) => symbol.escapedName === ts.InternalSymbolName.Computed,
                    ),
                    theNameOfAComputedMemberResolves: Option.isSome(
                      Option.flatMap(member, (element) => Option.fromNullishOr(ts.getNameOfDeclaration(element))),
                    ),
                    symbolAtTheNameDiffersFromTheMarker: Option.exists(
                      symbolAtTheName,
                      (symbol) => symbol.escapedName !== ts.InternalSymbolName.Computed,
                    ),
                  }
                },
                {
                  computedMarker: '',
                  memberCarriesTheMarkerAsItsEscapedName: false,
                  theNameOfAComputedMemberResolves: false,
                  symbolAtTheNameDiffersFromTheMarker: false,
                },
              )
            ),
        ),
        Then('the marker is the well-known text and the name yields a different symbol')((s, expect) =>
          expect(s.computed).toEqual({
            computedMarker: '__computed',
            memberCarriesTheMarkerAsItsEscapedName: true,
            theNameOfAComputedMemberResolves: true,
            symbolAtTheNameDiffersFromTheMarker: true,
          })
        ),
      ),
    )

    scenario(
      'The pin lane reports the compiler it was verified against and the one installed',
      Gherkin.Do.pipe(
        When('the lane reads the installed compiler version')(
          'compiler',
          // Upgrade tripwire (clause 3): upstream typed these internals for itself only, so this lane must re-run
          // whenever the installed compiler moves. Update the literal only after re-running the lane against it.
          () => Effect.sync(() => ({ verifiedAgainst: '5.9.3', installed: ts.version })),
        ),
        Then('the verified version is the installed one')((s, expect) =>
          expect(s.compiler).toEqual({ verifiedAgainst: '5.9.3', installed: '5.9.3' })
        ),
      ),
    )

    scenario(
      'Source map mappings arrive in generated order with specification lines and columns',
      Gherkin.Do.pipe(
        When('a hand-written source map is decoded through the generated-order enumeration')(
          'map',
          () =>
            // Relied on by src/collector/SourceMapper.ts: mappingItemsOf enumerates through GENERATED_ORDER and adds
            // one to each column, and nearestMapping binary-searches the result, which needs ascending input.
            Effect.sync(sourceMapItems),
        ),
        Then('every mapping is reported with 1-based lines and 0-based columns, ascending by generated position')(
          (s, expect) =>
            expect(s.map).toEqual({
              generatedOrderConstant: 1,
              originalOrderConstant: 2,
              items: [
                { generatedLine: 1, generatedColumn: 0, originalLine: 1, originalColumn: 0, source: 'a.ts' },
                { generatedLine: 2, generatedColumn: 0, originalLine: 2, originalColumn: 0, source: 'a.ts' },
              ],
              ascendsByGeneratedPosition: true,
            }),
        ),
      ),
    )

    scenario(
      'One tsdoc parser serves distinct ranges without mixing their contexts',
      Gherkin.Do.pipe(
        When('two doc comments are parsed by one parser instance')(
          'tsdoc',
          () =>
            // Relied on by collect-analysis.ts:101/117 and doc-comment-enhancement.ts:405: one parser per run is
            // reused for every declaration, and the engine reads modifierTagSet off each returned context.
            Effect.sync(tsdocObservation),
        ),
        Then('each context carries its own range and its own modifier tags')((s, expect) =>
          expect(s.tsdoc).toEqual({
            firstRange: '/**\n * First.\n * @public\n */',
            secondRange: '/**\n * Second.\n * @beta\n */',
            firstModifierTags: ['@public'],
            secondModifierTags: ['@beta'],
          })
        ),
      ),
    )

    scenario(
      'Range versions are ordered numerically and lower-bounded by their lowest admitted version',
      Gherkin.Do.pipe(
        When('the installed semver reads an unparsable range, a caret range and two versions')(
          'semver',
          () =>
            // Relied on by package-metadata.ts: typesVersionsMetadataPath picks the entry with the highest minimum
            // version through validRange, minVersion and gt, and skips any key whose range does not parse.
            Effect.sync(() => ({
              unparsableRange: semver.validRange('not a range'),
              caretRange: semver.validRange('^2.0.0'),
              caretMinimum: orMissing(
                Option.fromNullishOr(semver.minVersion('^2.0.0')),
                (minimum) => minimum.version,
                '',
              ),
              bareVersionMinimum: orMissing(
                Option.fromNullishOr(semver.minVersion('3.4.5')),
                (minimum) => minimum.version,
                '',
              ),
              twoIsNotAboveTen: semver.gt('2.0.0', '10.0.0'),
              tenIsAboveNine: semver.gt('10.0.0', '9.0.0'),
            })),
        ),
        Then('the unparsable range is refused, the caret range is expanded and order is numeric')((s, expect) =>
          expect(s.semver).toEqual({
            unparsableRange: null,
            caretRange: '>=2.0.0 <3.0.0-0',
            caretMinimum: '2.0.0',
            bareVersionMinimum: '3.4.5',
            twoIsNotAboveTen: false,
            tenIsAboveNine: true,
          })
        ),
      ),
    )

    scenario(
      'A report diff is rendered in the standard unified patch shape',
      Gherkin.Do.pipe(
        When('a structured patch of one changed line is formatted')(() =>
          // Relied on by src/write-plan.cell.ts: the printed report diff is formatPatch(structuredPatch(...)), and
          // its bytes are part of the surface the differential lane compares against upstream.
          Effect.void
        ),
        Then('the formatted patch keeps the separator, the file headers, the hunk header and the hunk lines')(
          (_s, expect) =>
            expect(unifiedPatchObservation()).toEqual({
              separatorIsEquals: true,
              separatorLength: 67,
              fileHeaders: ['--- etc/a.api.md', '+++ temp/a.api.md'],
              hunkHeader: '@@ -1,2 +1,2 @@',
              hunkLines: [' one', '-two', '+TWO'],
              hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
            }),
        ),
      ),
    )

    scenario(
      'Bundled package names are matched case-sensitively and dot names only with the dot option',
      Gherkin.Do.pipe(
        When('dependency names are matched against patterns with the default options')(
          'matches',
          () =>
            // Relied on by src/extraction-snapshot.ts:95: bundledPackages entries are matched with minimatch's
            // defaults, so the defaults themselves are the contract.
            Effect.sync(() => ({
              exactName: minimatch('other-pkg', 'other-pkg'),
              globSuffix: minimatch('other-pkg', 'other-*'),
              scopedGlob: minimatch('@scope/pkg', '@scope/*'),
              caseSensitiveByDefault: minimatch('Other-Pkg', 'other-pkg'),
              dotNameIsNotMatchedByTheStar: minimatch('.hidden', '*'),
              dotNameIsMatchedWithTheOption: minimatch('.hidden', '*', { dot: true }),
            })),
        ),
        Then('exact and glob names match, case differs, and the dot name needs the option')((s, expect) =>
          expect(s.matches).toEqual({
            exactName: true,
            globSuffix: true,
            scopedGlob: true,
            caseSensitiveByDefault: false,
            dotNameIsNotMatchedByTheStar: false,
            dotNameIsMatchedWithTheOption: true,
          })
        ),
      ),
    )
  })

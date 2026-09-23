import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Pipeable from 'effect/Pipeable'
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript'

import { ReleaseTag } from '../model/index.js'

import * as Snapshot from '../collector/analysis-snapshot.js'
import type { ApiItemMetadata } from '../collector/ApiItemMetadata.js'
import type { CollectorEntity } from '../collector/CollectorEntity.js'
import { ExtractorMessageId } from '../collector/extractor-message-id.js'
import type { SymbolMetadata } from '../collector/SymbolMetadata.js'
import { invariant } from '../utils/invariant.js'

const requireSome = <A>(option: Option.Option<A>, message: string): A => {
  if (Option.isNone(option)) {
    throw invariant(message)
  }
  return option.value
}

export class ValidationEnhancer extends Pipeable.Class {
  public static analyze(snapshot: Snapshot.AnalysisSnapshot): void {
    const alreadyWarnedEntities: Set<Snapshot.AstEntity> = new Set<Snapshot.AstEntity>()

    for (const entity of Snapshot.entities(snapshot)) {
      if (
        !(
          entity.consumable ||
          Snapshot.extractorConfig(snapshot).apiReport.includeForgottenExports ||
          Snapshot.extractorConfig(snapshot).docModel.includeForgottenExports
        )
      ) {
        continue
      }

      const astEntity = Snapshot.astEntityOf(entity)
      Match.value(Snapshot.refOf(astEntity)).pipe(
        Match.tag('AstSymbolRef', () => {
          // A regular exported AstSymbol

          const astSymbol = requireSome(Snapshot.astSymbolOf(astEntity), 'Missing AstSymbol for an AstSymbolRef')

          Snapshot.forEachDeclarationRecursive(snapshot, astSymbol, (astDeclaration) => {
            _checkReferences(snapshot, astDeclaration, alreadyWarnedEntities)
          })

          const symbolMetadata: SymbolMetadata = Snapshot.fetchSymbolMetadata(snapshot, astSymbol)
          _checkForInternalUnderscore(snapshot, entity, astSymbol, symbolMetadata)
          _checkForInconsistentReleaseTags(snapshot, astSymbol, symbolMetadata)
        }),
        Match.tag('AstNamespaceImportRef', () => {
          // A namespace created using "import * as ___ from ___"
          const astNamespaceImport = requireSome(
            Snapshot.astNamespaceImportOf(astEntity),
            'Missing AstNamespaceImport for an AstNamespaceImportRef',
          )

          const astModuleExportInfo = Snapshot.fetchAstModuleExportInfo(snapshot, astNamespaceImport)

          for (const namespaceMemberAstEntity of astModuleExportInfo.exportedLocalEntities.values()) {
            Match.value(Snapshot.refOf(namespaceMemberAstEntity)).pipe(
              Match.tag('AstSymbolRef', () => {
                const astSymbol = requireSome(
                  Snapshot.astSymbolOf(namespaceMemberAstEntity),
                  'Missing AstSymbol for an AstSymbolRef',
                )

                Snapshot.forEachDeclarationRecursive(snapshot, astSymbol, (astDeclaration) => {
                  _checkReferences(snapshot, astDeclaration, alreadyWarnedEntities)
                })

                const symbolMetadata: SymbolMetadata = Snapshot.fetchSymbolMetadata(snapshot, astSymbol)

                // (Don't apply _checkForInternalUnderscore() for AstNamespaceImport members)

                _checkForInconsistentReleaseTags(snapshot, astSymbol, symbolMetadata)
              }),
              Match.orElse(() => undefined),
            )
          }
        }),
        Match.orElse(() => undefined),
      )
    }
  }
}

function _checkForInternalUnderscore(
  snapshot: Snapshot.AnalysisSnapshot,
  collectorEntity: CollectorEntity,
  astSymbol: Snapshot.AstSymbol,
  symbolMetadata: SymbolMetadata,
): void {
  let needsUnderscore: boolean = false

  if (symbolMetadata.maxEffectiveReleaseTag === ReleaseTag.Internal) {
    Option.match(Snapshot.parentAstSymbol(snapshot, astSymbol), {
      onNone: () => {
        // If it's marked as @internal and has no parent, then it needs an underscore.
        // We use maxEffectiveReleaseTag because a merged declaration would NOT need an underscore in a case like this:
        //
        //   /* @public */
        //   export enum X { }
        //
        //   /* @internal */
        //   export namespace X { }
        //
        // (The above normally reports an error "ae-different-release-tags", but that may be suppressed.)
        needsUnderscore = true
      },
      onSome: () => {
        // If it's marked as @internal and the parent isn't obviously already @internal, then it needs an underscore.
        //
        // For example, we WOULD need an underscore for a merged declaration like this:
        //
        //   /* @internal */
        //   export namespace X {
        //     export interface _Y { }
        //   }
        //
        //   /* @public */
        //   export class X {
        //     /* @internal */
        //     public static _Y(): void { }   // <==== different from parent
        //   }
        const parentSymbolMetadata: SymbolMetadata = Snapshot.fetchSymbolMetadata(snapshot, astSymbol)
        if (parentSymbolMetadata.maxEffectiveReleaseTag > ReleaseTag.Internal) {
          needsUnderscore = true
        }
      },
    })
  }

  if (needsUnderscore) {
    for (const exportName of collectorEntity.exportNames) {
      if (exportName[0] !== '_') {
        Snapshot.addAnalyzerIssue(
          snapshot,
          ExtractorMessageId.InternalMissingUnderscore,
          `The name "${exportName}" should be prefixed with an underscore` +
            ` because the declaration is marked as @internal`,
          astSymbol,
          { exportName },
        )
      }
    }
  }
}

function _checkForInconsistentReleaseTags(
  snapshot: Snapshot.AnalysisSnapshot,
  astSymbol: Snapshot.AstSymbol,
  symbolMetadata: SymbolMetadata,
): void {
  if (Snapshot.isExternal(snapshot, astSymbol)) {
    // For now, don't report errors for external code.  If the developer cares about it, they should run
    // API Extractor separately on the external project
    return
  }

  // Normally we will expect all release tags to be the same.  Arbitrarily we choose the maxEffectiveReleaseTag
  // as the thing they should all match.
  const expectedEffectiveReleaseTag: ReleaseTag = symbolMetadata.maxEffectiveReleaseTag

  // This is set to true if we find a declaration whose release tag is different from expectedEffectiveReleaseTag
  let mixedReleaseTags: boolean = false

  // This is set to false if we find a declaration that is not a function/method overload
  let onlyFunctionOverloads: boolean = true

  // This is set to true if we find a declaration that is @internal
  let anyInternalReleaseTags: boolean = false

  for (const astDeclaration of Snapshot.astDeclarations(snapshot, astSymbol)) {
    const apiItemMetadata: ApiItemMetadata = Snapshot.fetchApiItemMetadata(snapshot, astDeclaration)
    const effectiveReleaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag

    switch (Snapshot.declaration(snapshot, astDeclaration).kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
        break
      default:
        onlyFunctionOverloads = false
    }

    if (effectiveReleaseTag !== expectedEffectiveReleaseTag) {
      mixedReleaseTags = true
    }

    if (effectiveReleaseTag === ReleaseTag.Internal) {
      anyInternalReleaseTags = true
    }
  }

  if (mixedReleaseTags) {
    if (!onlyFunctionOverloads) {
      Snapshot.addAnalyzerIssue(
        snapshot,
        ExtractorMessageId.DifferentReleaseTags,
        'This symbol has another declaration with a different release tag',
        astSymbol,
      )
    }

    if (anyInternalReleaseTags) {
      Snapshot.addAnalyzerIssue(
        snapshot,
        ExtractorMessageId.InternalMixedReleaseTag,
        `Mixed release tags are not allowed for "${
          Snapshot.localName(snapshot, astSymbol)
        }" because one of its declarations` +
          ` is marked as @internal`,
        astSymbol,
      )
    }
  }
}

interface ReferencedEntityCheck {
  readonly collectorEntity: Option.Option<CollectorEntity>
  readonly referencedReleaseTag: ReleaseTag
  readonly localName: string
}

function _checkReferences(
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
  alreadyWarnedEntities: Set<Snapshot.AstEntity>,
): void {
  const apiItemMetadata: ApiItemMetadata = Snapshot.fetchApiItemMetadata(snapshot, astDeclaration)
  const declarationReleaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag

  for (const referencedEntity of Snapshot.referencedAstEntities(snapshot, astDeclaration)) {
    const checked: Option.Option<ReferencedEntityCheck> = Match.value(Snapshot.refOf(referencedEntity)).pipe(
      Match.tag('AstSymbolRef', (): Option.Option<ReferencedEntityCheck> => {
        // If this is e.g. a member of a namespace, then we need to be checking the top-level scope to see
        // whether it's exported.
        //
        // TODO: Technically we should also check each of the nested scopes along the way.
        const referencedSymbol: Snapshot.AstSymbol = requireSome(
          Snapshot.astSymbolOf(referencedEntity),
          'Missing AstSymbol for an AstSymbolRef',
        )
        const rootSymbol: Snapshot.AstSymbol = Snapshot.rootAstSymbol(snapshot, referencedSymbol)

        if (Snapshot.isExternal(snapshot, rootSymbol)) {
          return Option.none()
        }

        const collectorEntity = Snapshot.tryGetCollectorEntity(snapshot, rootSymbol)
        const localName = Option.match(collectorEntity, {
          onNone: () => Snapshot.localName(snapshot, rootSymbol),
          onSome: (entity) => entity.nameForEmit || Snapshot.localName(snapshot, rootSymbol),
        })

        const referencedMetadata: SymbolMetadata = Snapshot.fetchSymbolMetadata(snapshot, referencedSymbol)

        return Option.some({
          collectorEntity,
          referencedReleaseTag: referencedMetadata.maxEffectiveReleaseTag,
          localName,
        })
      }),
      Match.tag('AstNamespaceImportRef', (): Option.Option<ReferencedEntityCheck> => {
        const collectorEntity = Snapshot.tryGetCollectorEntity(snapshot, referencedEntity)

        // TODO: Currently the "import * as ___ from ___" syntax does not yet support doc comments
        return Option.some({
          collectorEntity,
          referencedReleaseTag: ReleaseTag.Public,
          localName: Option.match(Snapshot.tryGetCollectorEntity(snapshot, referencedEntity), {
            onNone: () => Snapshot.localName(snapshot, referencedEntity),
            onSome: (entity) => entity.nameForEmit || Snapshot.localName(snapshot, referencedEntity),
          }),
        })
      }),
      Match.orElse((): Option.Option<ReferencedEntityCheck> => Option.none()),
    )

    if (Option.isNone(checked)) {
      continue
    }

    const { collectorEntity, referencedReleaseTag, localName } = checked.value

    if (Option.isSome(collectorEntity) && collectorEntity.value.consumable) {
      if (ReleaseTag.compare(declarationReleaseTag, referencedReleaseTag) > 0) {
        Snapshot.addAnalyzerIssue(
          snapshot,
          ExtractorMessageId.IncompatibleReleaseTags,
          `The symbol "${Snapshot.localName(snapshot, astDeclaration)}"` +
            ` is marked as ${ReleaseTag.getTagName(declarationReleaseTag)},` +
            ` but its signature references "${localName}"` +
            ` which is marked as ${ReleaseTag.getTagName(referencedReleaseTag)}`,
          astDeclaration,
        )
      }
    } else {
      const entryPointFilename: string =
        Snapshot.workingPackage(snapshot).entryPointSourceFile.fileName.split('/').pop() ?? ''

      if (!alreadyWarnedEntities.has(referencedEntity)) {
        alreadyWarnedEntities.add(referencedEntity)

        const isEcmaScriptSymbol = Match.value(Snapshot.refOf(referencedEntity)).pipe(
          Match.tag('AstSymbolRef', () =>
            _isEcmaScriptSymbol(
              snapshot,
              requireSome(Snapshot.astSymbolOf(referencedEntity), 'Missing AstSymbol for an AstSymbolRef'),
            )),
          Match.orElse(() => false),
        )

        if (!isEcmaScriptSymbol) {
          // The main usage scenario for ECMAScript symbols is to attach private data to a JavaScript object,
          // so as a special case, we do NOT report them as forgotten exports.
          Snapshot.addAnalyzerIssue(
            snapshot,
            ExtractorMessageId.ForgottenExport,
            `The symbol "${localName}" needs to be exported by the entry point ${entryPointFilename}`,
            astDeclaration,
          )
        }
      }
    }
  }
}

// Detect an AstSymbol that refers to an ECMAScript symbol declaration such as:
//
// const mySymbol: unique symbol = Symbol('mySymbol');
function _isEcmaScriptSymbol(snapshot: Snapshot.AnalysisSnapshot, astSymbol: Snapshot.AstSymbol): boolean {
  if (Snapshot.astDeclarations(snapshot, astSymbol).length !== 1) {
    return false
  }

  // We are matching a form like this:
  //
  // - VariableDeclaration:
  //   - Identifier:  pre=[mySymbol]
  //   - ColonToken:  pre=[:] sep=[ ]
  //   - TypeOperator:
  //     - UniqueKeyword:  pre=[unique] sep=[ ]
  //     - SymbolKeyword:  pre=[symbol]
  const astDeclaration: Snapshot.AstDeclaration | undefined = Snapshot.astDeclarations(snapshot, astSymbol)[0]
  if (!astDeclaration) {
    return false
  }
  const declaration = Snapshot.declaration(snapshot, astDeclaration)
  if (ts.isVariableDeclaration(declaration)) {
    const variableTypeNode: ts.TypeNode | undefined = declaration.type
    if (variableTypeNode) {
      for (const token of variableTypeNode.getChildren()) {
        if (token.kind === ts.SyntaxKind.SymbolKeyword) {
          return true
        }
      }
    }
  }

  return false
}

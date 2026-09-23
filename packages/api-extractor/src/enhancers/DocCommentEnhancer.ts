import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Pipeable from 'effect/Pipeable'
import * as Result from 'effect/Result'
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript'

import * as tsdoc from '@microsoft/tsdoc'
import { ReleaseTag } from '../model/index.js'

import * as Snapshot from '../collector/analysis-snapshot.js'
import type { ApiItemMetadata } from '../collector/ApiItemMetadata.js'
import { ExtractorMessageId } from '../collector/extractor-message-id.js'
import { VisitorState } from '../collector/VisitorState.js'
import { invariant } from '../utils/invariant.js'

const requireSome = <A>(option: Option.Option<A>, message: string): A => {
  if (Option.isNone(option)) {
    throw invariant(message)
  }
  return option.value
}

export class DocCommentEnhancer extends Pipeable.Class {
  readonly #snapshot: Snapshot.AnalysisSnapshot

  public constructor(snapshot: Snapshot.AnalysisSnapshot) {
    super()
    this.#snapshot = snapshot
  }

  public static analyze(snapshot: Snapshot.AnalysisSnapshot): void {
    const docCommentEnhancer: DocCommentEnhancer = new DocCommentEnhancer(snapshot)
    docCommentEnhancer.analyze()
  }

  public analyze(): void {
    for (const entity of Snapshot.entities(this.#snapshot)) {
      const astEntity = Snapshot.astEntityOf(entity)
      Match.value(Snapshot.refOf(astEntity)).pipe(
        Match.tag('AstSymbolRef', () => {
          if (
            entity.consumable ||
            Snapshot.extractorConfig(this.#snapshot).apiReport.includeForgottenExports ||
            Snapshot.extractorConfig(this.#snapshot).docModel.includeForgottenExports
          ) {
            Snapshot.forEachDeclarationRecursive(
              this.#snapshot,
              requireSome(Snapshot.astSymbolOf(astEntity), 'Missing AstSymbol for an AstSymbolRef'),
              (astDeclaration) => {
                this.#analyzeApiItem(astDeclaration)
              },
            )
          }
        }),
        Match.orElse(() => undefined),
      )
    }
  }

  #analyzeApiItem(astDeclaration: Snapshot.AstDeclaration): void {
    const metadata: ApiItemMetadata = Snapshot.fetchApiItemMetadata(this.#snapshot, astDeclaration)
    if (metadata.docCommentEnhancerVisitorState === VisitorState.Visited) {
      return
    }

    if (metadata.docCommentEnhancerVisitorState === VisitorState.Visiting) {
      Snapshot.addAnalyzerIssue(
        this.#snapshot,
        ExtractorMessageId.CyclicInheritDoc,
        `The @inheritDoc tag for "${Snapshot.localName(this.#snapshot, astDeclaration)}" refers to its own declaration`,
        astDeclaration,
      )
      return
    }
    metadata.docCommentEnhancerVisitorState = VisitorState.Visiting

    if (metadata.tsdocComment && metadata.tsdocComment.inheritDocTag) {
      this.#applyInheritDoc(astDeclaration, metadata.tsdocComment, metadata.tsdocComment.inheritDocTag)
    }

    this.#analyzeNeedsDocumentation(astDeclaration, metadata)

    this.#checkForBrokenLinks(astDeclaration, metadata)

    metadata.docCommentEnhancerVisitorState = VisitorState.Visited
  }

  #analyzeNeedsDocumentation(astDeclaration: Snapshot.AstDeclaration, metadata: ApiItemMetadata): void {
    if (Snapshot.declaration(this.#snapshot, astDeclaration).kind === ts.SyntaxKind.Constructor) {
      // Constructors always do pretty much the same thing, so it's annoying to require people to write
      // descriptions for them.  Instead, if the constructor lacks a TSDoc summary, then API Extractor
      // will auto-generate one.
      metadata.undocumented = false

      // The class that contains this constructor
      const classDeclaration: Snapshot.AstDeclaration = requireSome(
        Snapshot.parentAstDeclaration(this.#snapshot, astDeclaration),
        'Constructor declarations are expected to have a parent declaration',
      )

      const configuration: tsdoc.TSDocConfiguration = Snapshot.tsdocConfiguration(this.#snapshot)

      if (!metadata.tsdocComment) {
        metadata.tsdocComment = new tsdoc.DocComment({ configuration })
      }

      if (!tsdoc.PlainTextEmitter.hasAnyTextContent(metadata.tsdocComment.summarySection)) {
        metadata.tsdocComment.summarySection.appendNodesInParagraph([
          new tsdoc.DocPlainText({ configuration, text: 'Constructs a new instance of the ' }),
          new tsdoc.DocCodeSpan({
            configuration,
            code: Snapshot.localName(this.#snapshot, classDeclaration),
          }),
          new tsdoc.DocPlainText({ configuration, text: ' class' }),
        ])
      }

      const apiItemMetadata: ApiItemMetadata = Snapshot.fetchApiItemMetadata(this.#snapshot, astDeclaration)
      if (apiItemMetadata.effectiveReleaseTag === ReleaseTag.Internal) {
        // If the constructor is marked as internal, then add a boilerplate notice for the containing class
        const classMetadata: ApiItemMetadata = Snapshot.fetchApiItemMetadata(this.#snapshot, classDeclaration)

        if (!classMetadata.tsdocComment) {
          classMetadata.tsdocComment = new tsdoc.DocComment({ configuration })
        }

        if (classMetadata.tsdocComment.remarksBlock === undefined) {
          classMetadata.tsdocComment.remarksBlock = new tsdoc.DocBlock({
            configuration,
            blockTag: new tsdoc.DocBlockTag({
              configuration,
              tagName: tsdoc.StandardTags.remarks.tagName,
            }),
          })
        }

        classMetadata.tsdocComment.remarksBlock.content.appendNode(
          new tsdoc.DocParagraph({ configuration }, [
            new tsdoc.DocPlainText({
              configuration,
              text: `The constructor for this class is marked as internal. Third-party code should not` +
                ` call the constructor directly or create subclasses that extend the `,
            }),
            new tsdoc.DocCodeSpan({
              configuration,
              code: Snapshot.localName(this.#snapshot, classDeclaration),
            }),
            new tsdoc.DocPlainText({ configuration, text: ' class.' }),
          ]),
        )
      }
      return
    } else {
      // For non-constructor items, we will determine whether or not the item is documented as follows:
      // 1. If it contains a summary section with at least 10 characters, then it is considered "documented".
      // 2. If it contains an @inheritDoc tag, then it *may* be considered "documented", depending on whether or not
      //    the tag resolves to a "documented" API member.
      //    - Note: for external members, we cannot currently determine this, so we will consider the "documented"
      //      status to be unknown.
      if (metadata.tsdocComment) {
        if (tsdoc.PlainTextEmitter.hasAnyTextContent(metadata.tsdocComment.summarySection, 10)) {
          // If the API item has a summary comment block (with at least 10 characters), mark it as "documented".
          metadata.undocumented = false
        } else if (metadata.tsdocComment.inheritDocTag) {
          if (
            this.#refersToDeclarationInWorkingPackage(
              metadata.tsdocComment.inheritDocTag.declarationReference,
            )
          ) {
            // If the API item has an `@inheritDoc` comment that points to an API item in the working package,
            // then the documentation contents should have already been copied from the target via `_applyInheritDoc`.
            // The continued existence of the tag indicates that the declaration reference was invalid, and not
            // documentation contents could be copied.
            // An analyzer issue will have already been logged for this.
            // We will treat such an API as "undocumented".
            metadata.undocumented = true
          } else {
            // If the API item has an `@inheritDoc` comment that points to an external API item, we cannot currently
            // determine whether or not the target is "documented", so we cannot say definitively that this is "undocumented".
            metadata.undocumented = false
          }
        } else {
          // If the API item has neither a summary comment block, nor an `@inheritDoc` comment, mark it as "undocumented".
          metadata.undocumented = true
        }
      } else {
        // If there is no tsdoc comment at all, mark "undocumented".
        metadata.undocumented = true
      }
    }
  }

  #checkForBrokenLinks(astDeclaration: Snapshot.AstDeclaration, metadata: ApiItemMetadata): void {
    if (!metadata.tsdocComment) {
      return
    }
    this.#checkForBrokenLinksRecursive(astDeclaration, metadata.tsdocComment)
  }

  #checkForBrokenLinksRecursive(astDeclaration: Snapshot.AstDeclaration, node: tsdoc.DocNode): void {
    if (node instanceof tsdoc.DocLinkTag) {
      if (node.codeDestination) {
        // Is it referring to the working package?  If not, we don't do any link validation, because
        // AstReferenceResolver doesn't support it yet (but ModelReferenceResolver does of course).
        // Tracked by:  https://github.com/microsoft/rushstack/issues/1195
        if (this.#refersToDeclarationInWorkingPackage(node.codeDestination)) {
          Result.match(Snapshot.resolveReference(this.#snapshot, node.codeDestination), {
            onFailure: (reason) => {
              Snapshot.addAnalyzerIssue(
                this.#snapshot,
                ExtractorMessageId.UnresolvedLink,
                'The @link reference could not be resolved: ' + reason,
                astDeclaration,
              )
            },
            onSuccess: () => undefined,
          })
        }
      }
    }
    for (const childNode of node.getChildNodes()) {
      this.#checkForBrokenLinksRecursive(astDeclaration, childNode)
    }
  }

  /*
   * Follow an `{@inheritDoc ___}` reference and copy the content that we find in the referenced comment.
   */
  #applyInheritDoc(
    astDeclaration: Snapshot.AstDeclaration,
    docComment: tsdoc.DocComment,
    inheritDocTag: tsdoc.DocInheritDocTag,
  ): void {
    if (!inheritDocTag.declarationReference) {
      Snapshot.addAnalyzerIssue(
        this.#snapshot,
        ExtractorMessageId.UnresolvedInheritDocBase,
        'The @inheritDoc tag needs a TSDoc declaration reference; signature matching is not supported yet',
        astDeclaration,
      )
      return
    }

    if (!this.#refersToDeclarationInWorkingPackage(inheritDocTag.declarationReference)) {
      // The `@inheritDoc` tag is referencing an external package. Skip it, since AstReferenceResolver doesn't
      // support it yet.  As a workaround, this tag will get handled later by api-documenter.
      // Tracked by:  https://github.com/microsoft/rushstack/issues/1195
      return
    }

    Result.match(Snapshot.resolveReference(this.#snapshot, inheritDocTag.declarationReference), {
      onFailure: (reason) => {
        Snapshot.addAnalyzerIssue(
          this.#snapshot,
          ExtractorMessageId.UnresolvedInheritDocReference,
          'The @inheritDoc reference could not be resolved: ' + reason,
          astDeclaration,
        )
      },
      onSuccess: (referencedAstDeclaration) => {
        this.#analyzeApiItem(referencedAstDeclaration)

        const referencedMetadata: ApiItemMetadata = Snapshot.fetchApiItemMetadata(
          this.#snapshot,
          referencedAstDeclaration,
        )

        if (referencedMetadata.tsdocComment) {
          this.#copyInheritedDocs(docComment, referencedMetadata.tsdocComment)
        }
      },
    })
  }

  /*
   * Copy the content from `sourceDocComment` to `targetDocComment`.
   */
  #copyInheritedDocs(targetDocComment: tsdoc.DocComment, sourceDocComment: tsdoc.DocComment): void {
    targetDocComment.summarySection = sourceDocComment.summarySection
    targetDocComment.remarksBlock = sourceDocComment.remarksBlock

    targetDocComment.params.clear()
    for (const param of sourceDocComment.params) {
      targetDocComment.params.add(param)
    }
    for (const typeParam of sourceDocComment.typeParams) {
      targetDocComment.typeParams.add(typeParam)
    }
    targetDocComment.returnsBlock = sourceDocComment.returnsBlock

    targetDocComment.inheritDocTag = undefined
  }

  /*
   * Determines whether or not the provided declaration reference points to an item in the working package.
   */
  #refersToDeclarationInWorkingPackage(
    declarationReference: tsdoc.DocDeclarationReference | undefined,
  ): boolean {
    return (
      declarationReference?.packageName === undefined ||
      declarationReference.packageName === Snapshot.workingPackage(this.#snapshot).name
    )
  }
}

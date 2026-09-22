import { StandardTags, TSDocConfiguration, TSDocTagDefinition, TSDocTagSyntaxKind } from '@microsoft/tsdoc'
import * as Pipeable from 'effect/Pipeable'

export class AedocDefinitions extends Pipeable.Class {
  public static readonly betaDocumentation: TSDocTagDefinition = new TSDocTagDefinition({
    tagName: '@betaDocumentation',
    syntaxKind: TSDocTagSyntaxKind.ModifierTag,
  })

  public static readonly internalRemarks: TSDocTagDefinition = new TSDocTagDefinition({
    tagName: '@internalRemarks',
    syntaxKind: TSDocTagSyntaxKind.BlockTag,
  })

  public static readonly preapprovedTag: TSDocTagDefinition = new TSDocTagDefinition({
    tagName: '@preapproved',
    syntaxKind: TSDocTagSyntaxKind.ModifierTag,
  })

  public static createTsdocConfiguration(): TSDocConfiguration {
    const configuration = new TSDocConfiguration()
    configuration.addTagDefinitions(
      [
        AedocDefinitions.betaDocumentation,
        AedocDefinitions.internalRemarks,
        AedocDefinitions.preapprovedTag,
      ],
      true,
    )

    configuration.setSupportForTags(
      [
        StandardTags.alpha,
        StandardTags.beta,
        StandardTags.decorator,
        StandardTags.defaultValue,
        StandardTags.deprecated,
        StandardTags.eventProperty,
        StandardTags.example,
        StandardTags.inheritDoc,
        StandardTags.internal,
        StandardTags.link,
        StandardTags.override,
        StandardTags.packageDocumentation,
        StandardTags.param,
        StandardTags.privateRemarks,
        StandardTags.public,
        StandardTags.readonly,
        StandardTags.remarks,
        StandardTags.returns,
        StandardTags.sealed,
        StandardTags.throws,
        StandardTags.virtual,
      ],
      true,
    )

    return configuration
  }
}

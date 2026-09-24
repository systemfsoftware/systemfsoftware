import { StandardTags, TSDocConfiguration, TSDocTagDefinition, TSDocTagSyntaxKind } from '@microsoft/tsdoc'

export const betaDocumentation: TSDocTagDefinition = new TSDocTagDefinition({
  tagName: '@betaDocumentation',
  syntaxKind: TSDocTagSyntaxKind.ModifierTag,
})

export const internalRemarks: TSDocTagDefinition = new TSDocTagDefinition({
  tagName: '@internalRemarks',
  syntaxKind: TSDocTagSyntaxKind.BlockTag,
})

export const preapprovedTag: TSDocTagDefinition = new TSDocTagDefinition({
  tagName: '@preapproved',
  syntaxKind: TSDocTagSyntaxKind.ModifierTag,
})

export const createTsdocConfiguration = (): TSDocConfiguration => {
  const configuration = new TSDocConfiguration()
  configuration.addTagDefinitions(
    [
      betaDocumentation,
      internalRemarks,
      preapprovedTag,
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

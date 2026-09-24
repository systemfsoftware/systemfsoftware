export const ExtractorMessageId = {
  ExtraReleaseTag: 'ae-extra-release-tag',
  Undocumented: 'ae-undocumented',
  DifferentReleaseTags: 'ae-different-release-tags',
  IncompatibleReleaseTags: 'ae-incompatible-release-tags',
  MissingReleaseTag: 'ae-missing-release-tag',
  MisplacedPackageTag: 'ae-misplaced-package-tag',
  ForgottenExport: 'ae-forgotten-export',
  InternalMissingUnderscore: 'ae-internal-missing-underscore',
  InternalMixedReleaseTag: 'ae-internal-mixed-release-tag',
  PreapprovedUnsupportedType: 'ae-preapproved-unsupported-type',
  PreapprovedBadReleaseTag: 'ae-preapproved-bad-release-tag',
  UnresolvedInheritDocReference: 'ae-unresolved-inheritdoc-reference',
  UnresolvedInheritDocBase: 'ae-unresolved-inheritdoc-base',
  CyclicInheritDoc: 'ae-cyclic-inherit-doc',
  UnresolvedLink: 'ae-unresolved-link',
  SetterWithDocs: 'ae-setter-with-docs',
  MissingGetter: 'ae-missing-getter',
  UnresolvedImportPath: 'ae-unresolved-import-path',
  WrongInputFileType: 'ae-wrong-input-file-type',
} as const

export type ExtractorMessageId = (typeof ExtractorMessageId)[keyof typeof ExtractorMessageId]

const extractorMessageIds: ReadonlyArray<string> = Object.values(ExtractorMessageId)

export const allExtractorMessageIds: { readonly has: (messageId: string) => boolean } = {
  has: (messageId: string) => extractorMessageIds.includes(messageId),
}

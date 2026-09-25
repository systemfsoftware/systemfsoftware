import { resolveTsdocMetadataPath, TSDOC_METADATA_FILENAME } from '../analyzer/graph/package-metadata.js'

export interface TsdocMetadataInput {
  readonly packageName: string
  readonly packageVersion: string
}

const TSDOC_METADATA_BANNER =
  `// This file is read by tools that parse documentation comments conforming to the TSDoc standard.
// It should be published with your NPM package.  It should not be tracked by Git.
`

const tsdocMetadataBodyOf = (input: TsdocMetadataInput): string =>
  JSON.stringify(
    {
      tsdocVersion: '0.12',
      toolPackages: [
        {
          packageName: input.packageName,
          packageVersion: input.packageVersion,
        },
      ],
    },
    undefined,
    2,
  )

export const renderTsdocMetadata = (input: TsdocMetadataInput): string =>
  `${TSDOC_METADATA_BANNER}${tsdocMetadataBodyOf(input)}\n`

export { resolveTsdocMetadataPath, TSDOC_METADATA_FILENAME }

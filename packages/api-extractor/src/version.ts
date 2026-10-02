import packageJson from '../package.json' with { type: 'json' }

/**
 * The published package identity the engine stamps into generated artifacts and the CLI
 * advertises. Read from the manifest so a release bump cannot leave the version flag and the
 * tsdoc-metadata writer behind.
 */
export const extractorVersion: string = packageJson.version

/** The tool package name written into `tsdoc-metadata.json` as the tool that produced it. */
export const extractorPackageName = '@systemfsoftware/api-extractor'

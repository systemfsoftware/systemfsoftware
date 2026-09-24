export const DEFAULT_CONFIG_RECORD = {
  projectFolder: '<lookup>',
  compiler: {
    tsconfigFilePath: '<projectFolder>/tsconfig.json',
    skipLibCheck: false,
  },
  apiReport: {
    includeForgottenExports: false,
    reportFileName: '<unscopedPackageName>.api.md',
    reportFolder: '<projectFolder>/etc/',
    reportTempFolder: '<projectFolder>/temp/',
  },
  docModel: {
    includeForgottenExports: false,
    apiJsonFilePath: '<projectFolder>/temp/<unscopedPackageName>.api.json',
  },
  dtsRollup: {
    untrimmedFilePath: '<projectFolder>/dist/<unscopedPackageName>.d.ts',
    alphaTrimmedFilePath: '',
    betaTrimmedFilePath: '',
    publicTrimmedFilePath: '',
    omitTrimmingComments: false,
  },
  tsdocMetadata: {
    enabled: true,
    tsdocMetadataFilePath: '<lookup>',
  },
  messages: {
    compilerMessageReporting: {
      default: { logLevel: 'warning' },
    },
    extractorMessageReporting: {
      default: { logLevel: 'warning' },
      'ae-forgotten-export': { logLevel: 'warning', addToApiReportFile: true },
      'ae-incompatible-release-tags': { logLevel: 'warning', addToApiReportFile: true },
      'ae-internal-missing-underscore': { logLevel: 'warning', addToApiReportFile: true },
      'ae-internal-mixed-release-tag': { logLevel: 'warning', addToApiReportFile: true },
      'ae-unresolved-inheritdoc-base': { logLevel: 'warning', addToApiReportFile: true },
      'ae-unresolved-inheritdoc-reference': { logLevel: 'warning', addToApiReportFile: true },
      'ae-wrong-input-file-type': { logLevel: 'error' },
      'ae-undocumented': { logLevel: 'none' },
    },
    tsdocMessageReporting: {
      default: { logLevel: 'warning' },
    },
  },
  testMode: false,
  enumMemberOrder: 'by-name',
  newlineKind: 'crlf',
  bundledPackages: [],
}

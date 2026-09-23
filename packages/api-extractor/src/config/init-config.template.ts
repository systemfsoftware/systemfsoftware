export const CONFIG_FILE_NAME = 'api-extractor.json'

export const CONFIG_TEMPLATE = `{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "compiler": {
    "tsconfigFilePath": "<projectFolder>/tsconfig.json"
  },
  "apiReport": {
    "enabled": true,
    "reportFileName": "<unscopedPackageName>.api.md"
  },
  "docModel": {
    "enabled": false
  },
  "dtsRollup": {
    "enabled": false
  }
}
`

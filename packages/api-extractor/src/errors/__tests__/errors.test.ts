import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  ApiReportMismatchError,
  ApiReportMissingError,
  CircularConfigExtendsError,
  CircularNamespaceReferenceError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  ExtractorError,
  ForgottenExportError,
  isExtractorError,
  TsConfigReadError,
  TypeScriptDiagnosticError,
  UnresolvedTokenError,
  UnsupportedStarExportError,
  UnsupportedSyntaxError,
} from '../index.js'

describe('errors taxonomy', () => {
  describe('ConfigFileNotFound', () => {
    it('constructs with filePath and discriminates tag', () => {
      const error = new ConfigFileNotFound({ filePath: '/project/api-extractor.json' })
      expect(error).toBeInstanceOf(ConfigFileNotFound)
      expect(error._tag).toBe('ConfigFileNotFound')
      expect(error.filePath).toBe('/project/api-extractor.json')
      expect(isExtractorError(error)).toBe(true)
      expect(Schema.is(ConfigFileNotFound)(error)).toBe(true)
      expect(Schema.is(ConfigJsonSyntaxError)(error)).toBe(false)
    })

    it('round-trips through Schema encode and decode', () => {
      const error = new ConfigFileNotFound({ filePath: '/project/api-extractor.json' })
      const encoded = Schema.encodeSync(ConfigFileNotFound)(error)
      expect(encoded).toEqual({
        _tag: 'ConfigFileNotFound',
        filePath: '/project/api-extractor.json',
      })
      const decoded = Schema.decodeUnknownSync(ConfigFileNotFound)(encoded)
      expect(decoded).toBeInstanceOf(ConfigFileNotFound)
      expect(decoded._tag).toBe('ConfigFileNotFound')
      expect(decoded.filePath).toBe('/project/api-extractor.json')
    })
  })

  describe('ConfigJsonSyntaxError', () => {
    it('constructs without cause and round-trips', () => {
      const error = new ConfigJsonSyntaxError({ filePath: '/project/api-extractor.json' })
      expect(error).toBeInstanceOf(ConfigJsonSyntaxError)
      expect(error._tag).toBe('ConfigJsonSyntaxError')
      expect(error.filePath).toBe('/project/api-extractor.json')
      expect(error.cause).toBeUndefined()
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(ConfigJsonSyntaxError)(error)
      const decoded = Schema.decodeUnknownSync(ConfigJsonSyntaxError)(encoded)
      expect(decoded).toBeInstanceOf(ConfigJsonSyntaxError)
      expect(decoded._tag).toBe('ConfigJsonSyntaxError')
      expect(decoded.filePath).toBe('/project/api-extractor.json')
    })

    it('preserves cause on construction and round-trip', () => {
      const cause = new SyntaxError('Unexpected token } at 10:2')
      const error = new ConfigJsonSyntaxError({ filePath: '/project/api-extractor.json', cause })
      expect(error.cause).toBe(cause)

      const encoded = Schema.encodeSync(ConfigJsonSyntaxError)(error)
      const decoded = Schema.decodeUnknownSync(ConfigJsonSyntaxError)(encoded)
      expect(decoded.cause).toBe(cause)
    })
  })

  describe('ConfigSchemaValidationError', () => {
    it('constructs with issues array and round-trips', () => {
      const issues = ['Missing projectFolder', 'Unknown field customProperty']
      const error = new ConfigSchemaValidationError({
        filePath: '/project/api-extractor.json',
        issues,
      })
      expect(error).toBeInstanceOf(ConfigSchemaValidationError)
      expect(error._tag).toBe('ConfigSchemaValidationError')
      expect(error.filePath).toBe('/project/api-extractor.json')
      expect(error.issues).toEqual(['Missing projectFolder', 'Unknown field customProperty'])
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(ConfigSchemaValidationError)(error)
      const decoded = Schema.decodeUnknownSync(ConfigSchemaValidationError)(encoded)
      expect(decoded).toBeInstanceOf(ConfigSchemaValidationError)
      expect(decoded._tag).toBe('ConfigSchemaValidationError')
      expect(decoded.filePath).toBe('/project/api-extractor.json')
      expect(decoded.issues).toEqual(['Missing projectFolder', 'Unknown field customProperty'])
    })

    it('preserves cause on construction and round-trip', () => {
      const cause = new Error('Schema parse failed')
      const error = new ConfigSchemaValidationError({
        filePath: '/project/api-extractor.json',
        issues: ['Invalid enum value'],
        cause,
      })
      expect(error.cause).toBe(cause)

      const encoded = Schema.encodeSync(ConfigSchemaValidationError)(error)
      const decoded = Schema.decodeUnknownSync(ConfigSchemaValidationError)(encoded)
      expect(decoded.cause).toBe(cause)
    })
  })

  describe('UnresolvedTokenError', () => {
    it('constructs with token and configPath and round-trips', () => {
      const error = new UnresolvedTokenError({
        token: '<projectFolder>',
        configPath: '/project/api-extractor.json',
      })
      expect(error).toBeInstanceOf(UnresolvedTokenError)
      expect(error._tag).toBe('UnresolvedTokenError')
      expect(error.token).toBe('<projectFolder>')
      expect(error.configPath).toBe('/project/api-extractor.json')
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(UnresolvedTokenError)(error)
      const decoded = Schema.decodeUnknownSync(UnresolvedTokenError)(encoded)
      expect(decoded).toBeInstanceOf(UnresolvedTokenError)
      expect(decoded._tag).toBe('UnresolvedTokenError')
      expect(decoded.token).toBe('<projectFolder>')
      expect(decoded.configPath).toBe('/project/api-extractor.json')
    })
  })

  describe('CircularConfigExtendsError', () => {
    it('constructs with inheritance chain and round-trips', () => {
      const chain = ['/a/api-extractor.json', '/b/api-extractor.json', '/a/api-extractor.json']
      const error = new CircularConfigExtendsError({ chain })
      expect(error).toBeInstanceOf(CircularConfigExtendsError)
      expect(error._tag).toBe('CircularConfigExtendsError')
      expect(error.chain).toEqual([
        '/a/api-extractor.json',
        '/b/api-extractor.json',
        '/a/api-extractor.json',
      ])
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(CircularConfigExtendsError)(error)
      const decoded = Schema.decodeUnknownSync(CircularConfigExtendsError)(encoded)
      expect(decoded).toBeInstanceOf(CircularConfigExtendsError)
      expect(decoded._tag).toBe('CircularConfigExtendsError')
      expect(decoded.chain).toEqual([
        '/a/api-extractor.json',
        '/b/api-extractor.json',
        '/a/api-extractor.json',
      ])
    })
  })

  describe('TsConfigReadError', () => {
    it('constructs without cause and round-trips', () => {
      const error = new TsConfigReadError({ filePath: '/project/tsconfig.json' })
      expect(error).toBeInstanceOf(TsConfigReadError)
      expect(error._tag).toBe('TsConfigReadError')
      expect(error.filePath).toBe('/project/tsconfig.json')
      expect(error.cause).toBeUndefined()
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(TsConfigReadError)(error)
      const decoded = Schema.decodeUnknownSync(TsConfigReadError)(encoded)
      expect(decoded).toBeInstanceOf(TsConfigReadError)
      expect(decoded._tag).toBe('TsConfigReadError')
      expect(decoded.filePath).toBe('/project/tsconfig.json')
    })

    it('preserves cause on construction and round-trip', () => {
      const cause = new Error('ENOENT: no such file')
      const error = new TsConfigReadError({ filePath: '/project/tsconfig.json', cause })
      expect(error.cause).toBe(cause)

      const encoded = Schema.encodeSync(TsConfigReadError)(error)
      const decoded = Schema.decodeUnknownSync(TsConfigReadError)(encoded)
      expect(decoded.cause).toBe(cause)
    })
  })

  describe('TypeScriptDiagnosticError', () => {
    it('constructs with diagnostics array and round-trips', () => {
      const diagnostics = [
        { file: 'src/index.ts', line: 42, message: 'Cannot find name x' },
        { message: 'General build failure' },
      ]
      const error = new TypeScriptDiagnosticError({ diagnostics })
      expect(error).toBeInstanceOf(TypeScriptDiagnosticError)
      expect(error._tag).toBe('TypeScriptDiagnosticError')
      expect(error.diagnostics).toEqual([
        { file: 'src/index.ts', line: 42, message: 'Cannot find name x' },
        { message: 'General build failure' },
      ])
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(TypeScriptDiagnosticError)(error)
      const decoded = Schema.decodeUnknownSync(TypeScriptDiagnosticError)(encoded)
      expect(decoded).toBeInstanceOf(TypeScriptDiagnosticError)
      expect(decoded._tag).toBe('TypeScriptDiagnosticError')
      expect(decoded.diagnostics).toEqual([
        { file: 'src/index.ts', line: 42, message: 'Cannot find name x' },
        { message: 'General build failure' },
      ])
    })

    it('preserves cause on construction and round-trip', () => {
      const cause = new Error('TypeScript fatal error')
      const error = new TypeScriptDiagnosticError({ diagnostics: [], cause })
      expect(error.cause).toBe(cause)

      const encoded = Schema.encodeSync(TypeScriptDiagnosticError)(error)
      const decoded = Schema.decodeUnknownSync(TypeScriptDiagnosticError)(encoded)
      expect(decoded.cause).toBe(cause)
    })
  })

  describe('UnsupportedSyntaxError', () => {
    it('constructs with file, line, message and round-trips', () => {
      const error = new UnsupportedSyntaxError({
        file: 'src/module.ts',
        line: 10,
        message: 'Unsupported syntax',
      })
      expect(error).toBeInstanceOf(UnsupportedSyntaxError)
      expect(error._tag).toBe('UnsupportedSyntaxError')
      expect(error.file).toBe('src/module.ts')
      expect(error.line).toBe(10)
      expect(error.message).toBe('Unsupported syntax')
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(UnsupportedSyntaxError)(error)
      const decoded = Schema.decodeUnknownSync(UnsupportedSyntaxError)(encoded)
      expect(decoded).toBeInstanceOf(UnsupportedSyntaxError)
      expect(decoded._tag).toBe('UnsupportedSyntaxError')
      expect(decoded.file).toBe('src/module.ts')
      expect(decoded.line).toBe(10)
      expect(decoded.message).toBe('Unsupported syntax')
    })
  })

  describe('CircularNamespaceReferenceError', () => {
    it('constructs with namespaceName and members and round-trips', () => {
      const error = new CircularNamespaceReferenceError({
        namespaceName: 'Atom',
        members: ['Registry', 'Context'],
      })
      expect(error).toBeInstanceOf(CircularNamespaceReferenceError)
      expect(error._tag).toBe('CircularNamespaceReferenceError')
      expect(error.namespaceName).toBe('Atom')
      expect(error.members).toEqual(['Registry', 'Context'])
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(CircularNamespaceReferenceError)(error)
      const decoded = Schema.decodeUnknownSync(CircularNamespaceReferenceError)(encoded)
      expect(decoded).toBeInstanceOf(CircularNamespaceReferenceError)
      expect(decoded._tag).toBe('CircularNamespaceReferenceError')
      expect(decoded.namespaceName).toBe('Atom')
      expect(decoded.members).toEqual(['Registry', 'Context'])
    })
  })

  describe('UnsupportedStarExportError', () => {
    it('constructs with namespaceName and moduleSpecifier and round-trips', () => {
      const error = new UnsupportedStarExportError({
        namespaceName: 'Atom',
        moduleSpecifier: './submodule.js',
      })
      expect(error).toBeInstanceOf(UnsupportedStarExportError)
      expect(error._tag).toBe('UnsupportedStarExportError')
      expect(error.namespaceName).toBe('Atom')
      expect(error.moduleSpecifier).toBe('./submodule.js')
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(UnsupportedStarExportError)(error)
      const decoded = Schema.decodeUnknownSync(UnsupportedStarExportError)(encoded)
      expect(decoded).toBeInstanceOf(UnsupportedStarExportError)
      expect(decoded._tag).toBe('UnsupportedStarExportError')
      expect(decoded.namespaceName).toBe('Atom')
      expect(decoded.moduleSpecifier).toBe('./submodule.js')
    })
  })

  describe('ForgottenExportError', () => {
    it('constructs with exportName and containerName and round-trips', () => {
      const error = new ForgottenExportError({
        exportName: 'InternalHelper',
        containerName: 'MyPackage',
      })
      expect(error).toBeInstanceOf(ForgottenExportError)
      expect(error._tag).toBe('ForgottenExportError')
      expect(error.exportName).toBe('InternalHelper')
      expect(error.containerName).toBe('MyPackage')
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(ForgottenExportError)(error)
      const decoded = Schema.decodeUnknownSync(ForgottenExportError)(encoded)
      expect(decoded).toBeInstanceOf(ForgottenExportError)
      expect(decoded._tag).toBe('ForgottenExportError')
      expect(decoded.exportName).toBe('InternalHelper')
      expect(decoded.containerName).toBe('MyPackage')
    })
  })

  describe('ApiReportMismatchError', () => {
    it('constructs with reportFilePath and diff and round-trips', () => {
      const error = new ApiReportMismatchError({
        reportFilePath: 'etc/my-package.api.md',
        diff: '- export declare const old: string\n+ export declare const updated: string',
      })
      expect(error).toBeInstanceOf(ApiReportMismatchError)
      expect(error._tag).toBe('ApiReportMismatchError')
      expect(error.reportFilePath).toBe('etc/my-package.api.md')
      expect(error.diff).toBe(
        '- export declare const old: string\n+ export declare const updated: string',
      )
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(ApiReportMismatchError)(error)
      const decoded = Schema.decodeUnknownSync(ApiReportMismatchError)(encoded)
      expect(decoded).toBeInstanceOf(ApiReportMismatchError)
      expect(decoded._tag).toBe('ApiReportMismatchError')
      expect(decoded.reportFilePath).toBe('etc/my-package.api.md')
      expect(decoded.diff).toBe(
        '- export declare const old: string\n+ export declare const updated: string',
      )
    })
  })

  describe('ApiReportMissingError', () => {
    it('constructs with reportFilePath and round-trips', () => {
      const error = new ApiReportMissingError({
        reportFilePath: 'etc/my-package.api.md',
      })
      expect(error).toBeInstanceOf(ApiReportMissingError)
      expect(error._tag).toBe('ApiReportMissingError')
      expect(error.reportFilePath).toBe('etc/my-package.api.md')
      expect(isExtractorError(error)).toBe(true)

      const encoded = Schema.encodeSync(ApiReportMissingError)(error)
      const decoded = Schema.decodeUnknownSync(ApiReportMissingError)(encoded)
      expect(decoded).toBeInstanceOf(ApiReportMissingError)
      expect(decoded._tag).toBe('ApiReportMissingError')
      expect(decoded.reportFilePath).toBe('etc/my-package.api.md')
    })
  })

  describe('Tag discrimination and guard', () => {
    it('rejects decoding with incorrect tag', () => {
      const configError = new ConfigFileNotFound({ filePath: '/test.json' })
      const encoded = Schema.encodeSync(ConfigFileNotFound)(configError)
      const wrongTag = { ...encoded, _tag: 'ApiReportMissingError' }
      const decoded = Schema.decodeUnknownOption(ConfigFileNotFound)(wrongTag)
      expect(Option.isNone(decoded)).toBe(true)
    })

    it('Schema.is discriminates variants', () => {
      const error = new ConfigFileNotFound({ filePath: '/test.json' })
      expect(Schema.is(ConfigFileNotFound)(error)).toBe(true)
      expect(Schema.is(ConfigJsonSyntaxError)(error)).toBe(false)
      expect(Schema.is(ApiReportMissingError)(error)).toBe(false)
      expect(Schema.is(ExtractorError)(error)).toBe(true)
    })

    it('isExtractorError returns true for all variants and false for non-errors', () => {
      const variants = [
        new ConfigFileNotFound({ filePath: 'a' }),
        new ConfigJsonSyntaxError({ filePath: 'a' }),
        new ConfigSchemaValidationError({ filePath: 'a', issues: [] }),
        new UnresolvedTokenError({ token: 't', configPath: 'c' }),
        new CircularConfigExtendsError({ chain: [] }),
        new TsConfigReadError({ filePath: 'a' }),
        new TypeScriptDiagnosticError({ diagnostics: [] }),
        new UnsupportedSyntaxError({ file: 'f', line: 1, message: 'm' }),
        new CircularNamespaceReferenceError({ namespaceName: 'n', members: [] }),
        new UnsupportedStarExportError({ namespaceName: 'n', moduleSpecifier: 'm' }),
        new ForgottenExportError({ exportName: 'e', containerName: 'c' }),
        new ApiReportMismatchError({ reportFilePath: 'r', diff: 'd' }),
        new ApiReportMissingError({ reportFilePath: 'r' }),
      ]

      for (const variant of variants) {
        expect(isExtractorError(variant)).toBe(true)
      }

      expect(isExtractorError(new Error('plain error'))).toBe(false)
      expect(isExtractorError({ _tag: 'NotAnExtractorError' })).toBe(false)
      expect(isExtractorError(null)).toBe(false)
      expect(isExtractorError(undefined)).toBe(false)
      expect(isExtractorError(42)).toBe(false)
      expect(isExtractorError('string')).toBe(false)
      expect(isExtractorError({})).toBe(false)
    })
  })
})

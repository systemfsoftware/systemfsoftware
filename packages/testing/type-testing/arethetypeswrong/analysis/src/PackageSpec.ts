import { Result } from 'effect'
import { valid, validRange } from 'semver'
import validatePackageName from 'validate-npm-package-name'

import { PackageSpecParseError, type ParsedPackageSpec } from './PackageSpec.schema.js'

export const parsePackageSpec = (input: string): Result.Result<ParsedPackageSpec, PackageSpecParseError> => {
  let name: string
  let i = 0
  if (input.startsWith('@')) {
    i = input.indexOf('/')
    if (i === -1 || i === 1) {
      return Result.fail(new PackageSpecParseError({ message: 'Invalid package name' }))
    }
    i++
  }
  i = input.indexOf('@', i)
  if (i === -1) {
    name = input
  } else {
    name = input.slice(0, i)
  }
  const version = i === -1 ? '' : input.slice(i + 1)

  if (validatePackageName(name).errors) {
    return Result.fail(new PackageSpecParseError({ message: 'Invalid package name' }))
  }
  if (!version) {
    return Result.succeed({ versionKind: 'none' as const, name, version: '' })
  }
  if (valid(version)) {
    return Result.succeed({ versionKind: 'exact' as const, name, version })
  }
  if (validRange(version)) {
    return Result.succeed({ versionKind: 'range' as const, name, version })
  }
  return Result.succeed({ versionKind: 'tag' as const, name, version })
}

import * as Result from 'effect/Result'

const invalidNameCharactersRegExp = /[^A-Za-z0-9\-_.]/
const maximumNameLength = 214

export interface IParsedPackageNameOrError {
  readonly scope: string
  readonly unscopedName: string
  readonly error: string
}

export interface IParsedPackageName {
  readonly scope: string
  readonly unscopedName: string
}

const PackageNameParseErrorTag = { _tag: 'PackageNameParseError' } as const
type PackageNameParseErrorTag = typeof PackageNameParseErrorTag

export interface PackageNameParseError extends PackageNameParseErrorTag {
  readonly packageName: string
  readonly message: string
  readonly cause?: string | undefined
}

export const makePackageNameParseError = (
  packageName: string,
  message: string,
  cause?: string,
): PackageNameParseError => ({
  _tag: 'PackageNameParseError',
  packageName,
  message,
  cause,
})

const failure = (error: string): IParsedPackageNameOrError => ({ scope: '', unscopedName: '', error })

const succeed = (scope: string, unscopedName: string): IParsedPackageNameOrError => ({
  scope,
  unscopedName,
  error: '',
})

export const tryParsePackageName = (packageName: string): IParsedPackageNameOrError => {
  if (packageName.length > maximumNameLength) {
    return failure('The package name cannot be longer than 214 characters')
  }

  let input = packageName
  let scope = ''

  if (input.startsWith('@')) {
    const indexOfScopeSlash = input.indexOf('/')
    if (indexOfScopeSlash <= 0) {
      return failure(`Error parsing "${packageName}": The scope must be followed by a slash`)
    }
    scope = input.substring(0, indexOfScopeSlash)
    input = input.substring(indexOfScopeSlash + 1)
  }

  const unscopedName = input

  if (scope === '@') {
    return failure(`Error parsing "${packageName}": The scope name cannot be empty`)
  }

  if (unscopedName === '') {
    return failure('The package name must not be empty')
  }

  if (unscopedName.startsWith('.') || unscopedName.startsWith('_')) {
    return failure(`The package name "${packageName}" starts with an invalid character`)
  }

  if (scope !== scope.toLowerCase()) {
    return failure(`The package scope "${scope}" must not contain upper case characters`)
  }

  const nameWithoutScopeSymbols = (scope === '' ? '' : scope.slice(1, -1)) + unscopedName
  const match = nameWithoutScopeSymbols.match(invalidNameCharactersRegExp)
  if (match !== null) {
    return failure(`The package name "${packageName}" contains an invalid character: "${match[0]}"`)
  }

  return succeed(scope, unscopedName)
}

export const parsePackageName = (
  packageName: string,
): Result.Result<IParsedPackageName, PackageNameParseError> => {
  const result = tryParsePackageName(packageName)
  return result.error === ''
    ? Result.succeed({ scope: result.scope, unscopedName: result.unscopedName })
    : Result.fail(makePackageNameParseError(packageName, result.error))
}

export const getUnscopedPackageName = (
  packageName: string,
): Result.Result<string, PackageNameParseError> =>
  Result.map(parsePackageName(packageName), (parsed) => parsed.unscopedName)

export const isValidPackageName = (packageName: string): boolean => tryParsePackageName(packageName).error === ''

export const PackageName = {
  isValidName: isValidPackageName,
  getUnscopedName: getUnscopedPackageName,
  parse: parsePackageName,
  tryParse: tryParsePackageName,
} as const

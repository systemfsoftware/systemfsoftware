import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

const invalidNameCharactersRegExp = /[^A-Za-z0-9\-_.]/
const maximumNameLength = 214

interface IParsedPackageNameOrError {
  readonly scope: string
  readonly unscopedName: string
  readonly error: string
}

const failure = (error: string): IParsedPackageNameOrError => ({ scope: '', unscopedName: '', error })

const succeed = (scope: string, unscopedName: string): IParsedPackageNameOrError => ({
  scope,
  unscopedName,
  error: '',
})

interface ParsedNameParts {
  readonly scope: string
  readonly unscopedName: string
}

const stripScopeDelimiters = (scope: string): string => scope.slice(1, -1)

const nameWithoutScopeSymbols = (scope: string, unscopedName: string): string =>
  Match.value(scope).pipe(
    Match.when('', () => unscopedName),
    Match.orElse((value) => stripScopeDelimiters(value) + unscopedName),
  )

const invalidCharacterError = (packageName: string, scope: string, unscopedName: string): string | undefined =>
  Option.fromNullishOr(nameWithoutScopeSymbols(scope, unscopedName).match(invalidNameCharactersRegExp)).pipe(
    Option.map((matched) => `The package name "${packageName}" contains an invalid character: "${matched[0]}"`),
    Option.getOrUndefined,
  )

const validateParts = (packageName: string, scope: string, unscopedName: string): Option.Option<string> =>
  Arr.findFirst(
    [
      Match.value(scope).pipe(
        Match.when('@', () => `Error parsing "${packageName}": The scope name cannot be empty`),
        Match.orElse(() => undefined),
      ),
      Match.value(unscopedName).pipe(
        Match.when('', () => 'The package name must not be empty'),
        Match.orElse(() => undefined),
      ),
      Match.value(unscopedName.charAt(0)).pipe(
        Match.whenOr('.', '_', () => `The package name "${packageName}" starts with an invalid character`),
        Match.orElse(() => undefined),
      ),
      Match.value(scope).pipe(
        Match.when(
          (value: string) => value !== value.toLowerCase(),
          () => `The package scope "${scope}" must not contain upper case characters`,
        ),
        Match.orElse(() => undefined),
      ),
      invalidCharacterError(packageName, scope, unscopedName),
    ],
    (error): error is string => error !== undefined,
  )

const parseScope = (packageName: string): Result.Result<ParsedNameParts, string> =>
  Match.value(packageName.startsWith('@')).pipe(
    Match.when(false, () => Result.succeed({ scope: '', unscopedName: packageName })),
    Match.when(true, () => {
      const indexOfScopeSlash = packageName.indexOf('/')
      return Match.value(indexOfScopeSlash <= 0).pipe(
        Match.when(true, () => Result.fail(`Error parsing "${packageName}": The scope must be followed by a slash`)),
        Match.orElse(() =>
          Result.succeed({
            scope: packageName.substring(0, indexOfScopeSlash),
            unscopedName: packageName.substring(indexOfScopeSlash + 1),
          })
        ),
      )
    }),
    Match.exhaustive,
  )

const tryParseScopedPackageName = (packageName: string): IParsedPackageNameOrError =>
  Result.match(parseScope(packageName), {
    onFailure: (error) => failure(error),
    onSuccess: (parts: ParsedNameParts) =>
      Option.match(validateParts(packageName, parts.scope, parts.unscopedName), {
        onNone: () => succeed(parts.scope, parts.unscopedName),
        onSome: (error) => failure(error),
      }),
  })

const tryParsePackageName = (packageName: string): IParsedPackageNameOrError =>
  Match.value(packageName.length > maximumNameLength).pipe(
    Match.when(true, () => failure('The package name cannot be longer than 214 characters')),
    Match.orElse(() => tryParseScopedPackageName(packageName)),
  )

const isValidPackageName = (packageName: string): boolean => tryParsePackageName(packageName).error === ''

export const PackageName = {
  isValidName: isValidPackageName,
} as const

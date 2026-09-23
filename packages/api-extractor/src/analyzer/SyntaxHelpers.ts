import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

const normalizeCase = (part: string): string =>
  Match.value(part.toUpperCase() === part).pipe(
    Match.when(true, () => part.toLowerCase()),
    Match.orElse(() => part),
  )

const capitalize = (part: string): string => part.charAt(0).toUpperCase() + part.slice(1)

const prefixIfDigit = (part: string): string =>
  Match.value(/[0-9]/.test(part.charAt(0))).pipe(
    Match.when(true, () => `_${part}`),
    Match.orElse(() => part),
  )

const toCamelPart = (part: string, index: number): string => {
  const normalized = normalizeCase(part)
  return Match.value(index).pipe(
    Match.when(0, () => prefixIfDigit(normalized)),
    Match.orElse(() => capitalize(normalized)),
  )
}

const isSafeIdentifierCharacter = (character: string, index: number): boolean =>
  Match.value(index).pipe(
    Match.when(0, () => ts.isIdentifierStart(character.charCodeAt(0), ts.ScriptTarget.ES5)),
    Match.orElse(() => ts.isIdentifierPart(character.charCodeAt(0), ts.ScriptTarget.ES5)),
  )

export const isSafeUnquotedMemberIdentifier = (identifier: string): boolean =>
  identifier.length > 0 && Arr.every(Array.from(identifier), isSafeIdentifierCharacter)

export const makeCamelCaseIdentifier = (input: string): string =>
  Match.value(input.split(/\W+/).filter((part) => part.length > 0)).pipe(
    Match.when((parts) => parts.length === 0, () => '_'),
    Match.orElse((parts) => parts.map((part, index) => toCamelPart(part, index)).join('')),
  )

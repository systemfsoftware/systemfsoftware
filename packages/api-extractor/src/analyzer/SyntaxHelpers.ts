import * as Pipeable from 'effect/Pipeable'
import * as ts from 'typescript'

const toCamelPart = (part: string, index: number): string => {
  let p = part
  if (p.toUpperCase() === p) {
    p = p.toLowerCase()
  }
  if (index === 0) {
    if (/[0-9]/.test(p.charAt(0))) {
      p = `_${p}`
    }
  } else {
    p = p.charAt(0).toUpperCase() + p.slice(1)
  }
  return p
}

export class SyntaxHelpers extends Pipeable.Class {
  public static isSafeUnquotedMemberIdentifier(identifier: string): boolean {
    if (identifier.length === 0) {
      return false
    }

    if (!ts.isIdentifierStart(identifier.charCodeAt(0), ts.ScriptTarget.ES5)) {
      return false
    }

    for (let i = 1; i < identifier.length; i++) {
      if (!ts.isIdentifierPart(identifier.charCodeAt(i), ts.ScriptTarget.ES5)) {
        return false
      }
    }

    return true
  }

  public static makeCamelCaseIdentifier(input: string): string {
    const parts: string[] = input.split(/\W+/).filter((x) => x.length > 0)
    if (parts.length === 0) {
      return '_'
    }

    for (let i = 0; i < parts.length; ++i) {
      parts[i] = toCamelPart(parts[i] ?? '', i)
    }
    return parts.join('')
  }
}

if (import.meta.vitest !== void 0) {
  // Exception: in-source tests load @effect/vitest dynamically to avoid bundling test libraries
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')

  const SampleString = Schema.NonEmptyString

  it.prop(
    '∀s_CamelCase_≡Prefixed',
    [SampleString],
    ([str]) => {
      const part = `1${str}`
      const result = toCamelPart(part, 0)
      return result.startsWith('_')
    },
  )
}

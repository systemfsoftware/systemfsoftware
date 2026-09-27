import * as Option from 'effect/Option'

export const projectNamesOf = (script: string): readonly string[] | undefined => {
  const names = [...script.matchAll(/--project(?:=|\s+)([^\s=]+)/gu)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined)
  return names.length === 0 ? undefined : names
}

export const runsConformanceProject = (test: string | undefined): boolean =>
  Option.match(Option.fromUndefinedOr(test), {
    onNone: () => true,
    onSome: (script) =>
      Option.match(Option.fromUndefinedOr(projectNamesOf(script)), {
        onNone: () => true,
        onSome: (names) => names.includes('conformance'),
      }),
  })

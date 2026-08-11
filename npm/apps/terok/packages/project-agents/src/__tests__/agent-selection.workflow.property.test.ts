import { describe, it } from '@effect/vitest'
import { Arbitrary, Either, FastCheck as fc } from 'effect'
import { validateSelection, ValidateSelectionCommand } from '../agent-selection.workflow.js'

describe('validateSelection — grammar and validation', () => {
  it.prop(
    '∀c_Selection_=VerbatimRaw',
    [ValidateSelectionCommand],
    ([command]) =>
      Either.match(validateSelection(command), {
        onLeft: () => true,
        onRight: (decision) => decision.raw === command.raw,
      }),
  )

  it.prop('∀g_Selection_∈Accepted', [fc.gen()], ([g]) => {
    const command = g(Arbitrary.make, ValidateSelectionCommand)
    const installable = command.roster.filter((entry) => entry.install)
    if (installable.length === 0) return true
    const raw = installable.slice(0, 2).map((entry) => entry.name.toUpperCase()).join(' , ')
    return Either.match(validateSelection(new ValidateSelectionCommand({ raw, roster: command.roster })), {
      onLeft: () => false,
      onRight: (decision) => decision.raw === raw && decision.parsed._tag === 'NamedSelection',
    })
  })

  it.prop('∀g_UnknownSelection_∈ErrorChannel', [fc.gen()], ([g]) => {
    const command = g(Arbitrary.make, ValidateSelectionCommand)
    const installable = command.roster.filter((entry) => entry.install)
    const first = installable[0]
    const base = first === undefined ? 'a' : first.name
    const raw = `${base}!`
    return Either.match(validateSelection(new ValidateSelectionCommand({ raw, roster: command.roster })), {
      onLeft: (error) =>
        error._tag === 'UnknownRosterEntriesError' &&
        error.unknownNames.includes(raw) &&
        error.availableNames.every((name) => command.roster.some((entry) => entry.install && entry.name === name)),
      onRight: () => false,
    })
  })

  it.prop('∀g_BareExclude_⊇SeedsAll', [fc.gen()], ([g]) => {
    const command = g(Arbitrary.make, ValidateSelectionCommand)
    const installable = command.roster.filter((entry) => entry.install)
    const first = installable[0]
    if (first === undefined) return true
    const raw = `-${first.name.toUpperCase()}`
    const isDep = command.roster.some((entry) => entry.dependsOn.includes(first.name))
    return Either.match(validateSelection(new ValidateSelectionCommand({ raw, roster: command.roster })), {
      onLeft: () => false,
      onRight: (decision) => {
        if (decision.parsed._tag !== 'AllSelection') return false
        const resolved = new Set(decision.resolved)
        const declaredDeps = new Set(command.roster.flatMap((entry) => entry.dependsOn))
        const othersKept = installable.every((entry) => entry.name === first.name || resolved.has(entry.name))
        const withinReach = decision.resolved.every(
          (name) => installable.some((entry) => entry.name === name) || declaredDeps.has(name),
        )
        return (isDep || !resolved.has(first.name)) && othersKept && withinReach
      },
    })
  })

  it.prop('∀g_Selection_⊇TransitiveDeps', [fc.gen()], ([g]) => {
    const command = g(Arbitrary.make, ValidateSelectionCommand)
    const entry = command.roster.find((candidate) => candidate.install && candidate.dependsOn.length > 0)
    if (entry === undefined) return true
    if (command.roster.some((other) => other !== entry && other.name === entry.name)) return true
    return Either.match(validateSelection(new ValidateSelectionCommand({ raw: entry.name, roster: command.roster })), {
      onLeft: () => false,
      onRight: (decision) => entry.dependsOn.every((dep) => decision.resolved.includes(dep)),
    })
  })

  it.prop('∀g_AllLiteral_=AllSelection', [fc.gen()], ([g]) => {
    const command = g(Arbitrary.make, ValidateSelectionCommand)
    const raw = '  ALL  '
    return Either.match(validateSelection(new ValidateSelectionCommand({ raw, roster: command.roster })), {
      onLeft: () => false,
      onRight: (decision) => decision.parsed._tag === 'AllSelection' && decision.raw === raw,
    })
  })

  it.prop('∀g_BareDash_∈SyntaxError', [fc.gen()], ([g]) => {
    const command = g(Arbitrary.make, ValidateSelectionCommand)
    return Either.match(validateSelection(new ValidateSelectionCommand({ raw: 'claude,-', roster: command.roster })), {
      onLeft: (error) => error._tag === 'InvalidSelectionSyntaxError',
      onRight: () => false,
    })
  })
})

import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

/**
 * The calls whose whole purpose is to fabricate an object carrying another
 * object's members. Each produces a value whose static type satisfies `make`'s
 * bound while the value itself is not the class, which is the one thing the type
 * layer cannot see.
 *
 * This is an enumeration rather than "any call", because most calls at the command
 * position are fine: a factory that returns the real class returns the real class,
 * and `S.Struct(...)` or `S.TaggedClass<X>()(...)` are decided by the compiler
 * already. Refusing every call would report all three.
 *
 * Canonical spellings only (`OX-CI1`): `Object.assign` written out. An alias
 * (`const oa = Object.assign`) does not fire, and the suite keeps a fixture
 * pinning that silence so a widening to aliases cannot land unnoticed.
 */
export const LAUNDERING_CALLS: readonly string[] = [
  'Object.assign',
  'Object.create',
  'Object.defineProperty',
  'Object.defineProperties',
  'Object.setPrototypeOf',
  'Reflect.construct',
  'Reflect.set',
]

/** Constructors that wrap a target and forward to it, standing in for the class. */
export const LAUNDERING_CONSTRUCTORS: readonly string[] = ['Proxy']
export const ASSERTED_EXPECTED =
  'a command position holding a schema class the compiler checked, never a value re-labelled to look like one' as const
export const ASSERTED_ACTUAL = 'a type assertion at the command position' as const
export const ASSERTED_FIX =
  'delete the assertion and pass the schema class itself; if no schema class exists for this command, declare one - an assertion here does not create the identity `make` checks for, it only stops the compiler from noticing its absence' as const

export const LAUNDERED_EXPECTED =
  'a command position holding a schema class or the Effect subclass call that produces one' as const
export const LAUNDERED_ACTUAL = 'a call at the command position whose callee is not a schema-class member' as const
export const LAUNDERED_FIX =
  'pass the schema class directly, or extend it with Base.extend(...) which returns one; a wrapper that assembles an object with the right members satisfies the type without carrying the class identity, so delete the wrapper rather than finding it a new home' as const

export const DECLARED_EXPECTED = 'a command position holding a schema class that exists at runtime' as const
export const DECLARED_ACTUAL = 'a `declare`d binding at the command position' as const
export const DECLARED_FIX =
  'delete the `declare` and define the schema class, or import the real one; a declared binding produces no value, so this command position is empty at runtime no matter what its type says' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'The command position of Workflow.make holds a schema class, not a value laundered into looking like one. Only the positions the compiler cannot decide are reported.',
  },
  schema: [Options],
  messages: {
    assertedCommand: MESSAGE,
    launderedCommand: MESSAGE,
    declaredCommand: MESSAGE,
  },
} as const

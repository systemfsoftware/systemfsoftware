export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const TYPEID_EXPECTED =
  "a module that exports its TypeId as Symbol.for('<literal>') and declares no other Symbol" as const

export const STRING_TYPEID_ACTUAL_OF = (name: string, value: string): string =>
  `the exported TypeId \`${name}\` is the string \`${value}\`, not a symbol` as const

export const UNEXPORTED_TYPEID_ACTUAL = 'a TypeId that is not exported' as const

export const MISSING_TYPEID_ACTUAL = 'a module with no exported TypeId' as const

export const extraSymbolActualOf = (call: string): string => `a hand-rolled symbol declaration (${call})` as const
export const NOT_SYMBOL_CALL_ACTUAL = "an exported TypeId that is not a `Symbol.for('<literal>')` call" as const

export const TYPEID_FIX =
  "export the identity as `export const TypeId = Symbol.for('~<org>/<package>/<Kind>')` — resource-vs-handle-duality.md §3 item 1: the TypeId is a nominal symbol brand" as const

export const SLOT_FIX =
  "delete the extra symbol and put the private state in the kind's slot instead: pass it to Handle.make<Data, Slot>()(TypeId) and read it back with the definition's slot — never a hand-rolled module symbol" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "A *.blueprint.ts / *.handle.ts file exports its TypeId declared as Symbol.for('<literal>') and declares no other Symbol(...)/Symbol.for(...) call.",
  },
  schema: [],
  messages: {
    notSymbolFor: MESSAGE,
    extraSymbol: MESSAGE,
  },
} as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a blueprint or handle record minted only by the kind — Blueprint.make/Handle.make attach the [TypeId] brand and the Pipeable prototype themselves' as const

export const PROTOTYPE_ACTUAL = 'an object literal spreading Prototype from effect/Pipeable' as const
export const TYPEID_KEY_ACTUAL = 'an object literal with a computed [TypeId] symbol key' as const

export const PROTOTYPE_FIX =
  'delete the spread and mint the value through the kind — the blueprint carries its steps as methods and the handle carries its data, and the kind attaches the prototype for both (pipeable-dual-parity.md §1)' as const

export const TYPEID_KEY_FIX =
  "delete the computed key and mint the value through the kind, which brands the record with the TypeId itself (resource-vs-handle-duality.md §3: nominal branding is the kind's job, not the module's)" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Blueprint and handle files mint records only through the kind: no object literal spreads Pipeable.Prototype and none carries a computed [TypeId] key.',
  },
  schema: [],
  messages: {
    prototypeSpread: MESSAGE,
    typeIdKey: MESSAGE,
  },
} as const

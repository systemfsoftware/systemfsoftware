export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'a *.cell.ts file that registers no release and closes no scope — the resource and handle kinds own both, through Handle.make’s release stages and Resource.make’s scoped acquisition' as const

export const actualOf = (member: string): string =>
  `a call to the release-registering or scope-closing effect export ${member}` as const

export const FIX =
  'move the acquisition into a *.resource.ts (its prepare or the handle’s create) or a *.handle.ts release stage; the cell only runs what the kinds have already scoped' as const

export const LIFECYCLE_MEMBERS: Readonly<Record<string, true>> = {
  acquireRelease: true,
  acquireDisposable: true,
  acquireUseRelease: true,
  addFinalizer: true,
  ensuring: true,
  onExit: true,
  onExitIf: true,
  onExitFilter: true,
  scoped: true,
  close: true,
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.cell.ts file neither registers a release nor closes a scope (R24); both belong to the resource and handle kinds.',
  },
  schema: [],
  messages: {
    lifecycleOwnership: MESSAGE,
  },
} as const

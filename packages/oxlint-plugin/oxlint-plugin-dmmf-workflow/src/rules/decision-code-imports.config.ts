export const DECISION_MODULE_SUFFIXES: readonly string[] = [
  '.schema.js',
  '.schema.ts',
  '.workflow.js',
  '.workflow.ts',
]

export const DECISION_FILE_SUFFIXES: readonly string[] = ['.schema.ts', '.workflow.ts']

export const OPEN_PACKAGES: readonly string[] = ['effect', '@systemfsoftware/effect-cell-types']

export const SCHEMA_MEMBERS: ReadonlySet<string> = new Set(['make', 'is', 'fields', 'ast', 'annotations'])

export const MANIFEST_FILE = 'decision-code.json'

export const RULE_NAME = 'decision-code-imports'

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXPECTED =
  'decision code (*.workflow.ts and *.schema.ts under src/) referencing only effect, @systemfsoftware/effect-cell-types, relative *.schema / *.workflow modules, workspace schemas used as schemas, and the proved kernels decision-code.json names' as const

export const PLAIN_MODULE_ACTUAL =
  'a runtime import of {{source}}, a relative module whose basename carries neither the .schema nor the .workflow suffix' as const

export const PLAIN_MODULE_FIX =
  'move the code the decision needs into this file or into the *.schema.ts file of the type it operates on, and let the module that renders or formats import the decision instead; use import type when only types are needed' as const

export const FOREIGN_SOURCE_ACTUAL =
  'a runtime import of {{source}}, which is not effect, not @systemfsoftware/effect-cell-types, not a package of this workspace and not a proved kernel in decision-code.json' as const

export const FOREIGN_SOURCE_FIX =
  'delete the import and take what it supplies as data from the caller, or use import type when only types are needed; a package enters decision code only as a kernels entry in decision-code.json naming its proof' as const

export const WORKSPACE_BINDING_ACTUAL =
  '{{binding}} from the workspace package {{source}}, used as something other than a schema (a call, an alias, a destructuring or an argument to a non-Schema call)' as const

export const WORKSPACE_BINDING_FIX =
  'use the binding only as a schema - in a type, as an argument to S.* / Schema.*, or through .make, .is, .fields, .ast or .annotations - and move the operation the decision calls into this file or into a *.schema.ts file of this package' as const

export const DYNAMIC_IMPORT_ACTUAL = 'a module load at run time ({{form}}) in decision code' as const

export const DYNAMIC_IMPORT_FIX =
  'delete the load; decision code names every module on a static import line, and in-source tests load theirs inside the if (import.meta.vitest) block' as const

export const RE_EXPORT_ACTUAL = 'a re-export from {{source}} in decision code' as const

export const RE_EXPORT_FIX =
  'delete the re-export and let consumers import {{source}} themselves; a decision file exports its own declarations' as const

export const DISABLE_DIRECTIVE_ACTUAL = 'the inline directive "{{directive}}", which silences this rule' as const

export const DISABLE_DIRECTIVE_FIX =
  'delete the directive and fix what it silenced; no comment or setting inside the file exempts decision code' as const

export const SIDE_EFFECT_IMPORT_ACTUAL =
  "a side-effect import of the workspace package {{source}}, which runs that package's module code in decision code and imports no schema" as const

export const SIDE_EFFECT_IMPORT_FIX =
  'delete the import, and import by name the schemas the decision uses from {{source}}' as const

export const MANIFEST_UNREADABLE_ACTUAL = '{{path}} cannot be read as a decision-code manifest: {{reason}}' as const

export const MANIFEST_UNREADABLE_FIX =
  'make the file a JSON object {"kernels": [{"package": <name>, "proof": <repo-relative path of an existing file that proves the package pure>}...]}' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Decision code - every *.workflow.ts and *.schema.ts file under a package src/ - reaches only other decision code. Across the whole file, a runtime reference resolves only to effect, @systemfsoftware/effect-cell-types, a relative module that resolves to a *.schema.ts or *.workflow.ts file under the same package src/, a workspace package binding used as a schema, or a proved kernel named in the repo-level decision-code.json with an existing proof file. A plain or out-of-package relative module, any other package, a side-effect import of a workspace package, a call or alias of a workspace binding, import(), any reference to require, import = require() and export ... from are reported. Type-only imports are ignored, and so is an in-source test block guarded by import.meta.vitest. An inline disable directive that would silence the rule is reported itself, and no list of existing offenders exempts a file.',
  },
  schema: [],
  messages: {
    plainModuleImport: MESSAGE,
    foreignSourceImport: MESSAGE,
    workspaceBindingUse: MESSAGE,
    dynamicImport: MESSAGE,
    reExport: MESSAGE,
    disableDirective: MESSAGE,
    sideEffectImport: MESSAGE,
    manifestUnreadable: MESSAGE,
  },
} as const

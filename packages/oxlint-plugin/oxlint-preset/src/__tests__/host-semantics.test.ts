import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import {
  LOCAL_OXLINT,
  PACKAGE_ROOT,
  packageWorkDir,
  pluginModule,
  removeWorkDirs,
  REPO_ROOT,
  run,
  tailJson,
  writeFiles,
} from './oxlint-probe.js'

afterAll(removeWorkDirs)

const MEASURED_OXLINT_VERSION = '1.77.0'

type ResolvedConfig = {
  plugins?: string[]
  ignorePatterns?: string[]
  jsPlugins?: unknown[]
  rules?: Record<string, string>
}

type LintResult = { code: number; codes: string[]; files: string[] }

const printConfig = (dir: string, config: string): ResolvedConfig => {
  const result = run(LOCAL_OXLINT, ['--print-config', '-c', config], dir)
  if (result.code !== 0) throw new Error(`oxlint could not resolve ${config}: ${result.output}`)
  const parsed: ResolvedConfig = JSON.parse(tailJson(result.output))
  return parsed
}

const lint = (dir: string, config: string, ...paths: string[]): LintResult => {
  const result = run(LOCAL_OXLINT, ['-c', config, '-f', 'json', ...paths], dir)
  const parsed: { diagnostics: { code: string; filename: string }[] } = JSON.parse(tailJson(result.output))
  return {
    code: result.code,
    codes: parsed.diagnostics.map((diagnostic) => diagnostic.code),
    files: parsed.diagnostics.map((diagnostic) => diagnostic.filename),
  }
}

const VARIABLE_FILE = 'var value = 1\nexport { value }\n'
const CONSTANT_FILE = 'const value = 1\nexport { value }\n'

const collectOxlintConfigs = (dir: string): string[] => {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'temp', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collectOxlintConfigs(full))
    else if (entry.name === 'oxlint.config.ts') found.push(full)
  }
  return found
}

describe('measurement host', () => {
  it('Should_ReportTheMeasuredVersion_When_TheProbesDependOnItsSemantics', () => {
    expect(run(LOCAL_OXLINT, ['--version'], PACKAGE_ROOT).output).toContain(MEASURED_OXLINT_VERSION)
  })
})

describe('table row: rules merge last-wins', () => {
  it('Should_ApplyTheChildRule_When_TheChildOverridesAnExtendedRule', () => {
    const raised = packageWorkDir('rules-child-raised')
    writeFiles(raised, {
      'parent.ts': "export default { rules: { 'no-var': 'off' } }\n",
      'child.ts':
        "import parent from './parent.ts'\nexport default { extends: [parent], rules: { 'no-var': 'error' } }\n",
      'target.ts': VARIABLE_FILE,
    })
    expect(lint(raised, 'child.ts', 'target.ts').codes).toContain('eslint(no-var)')

    const lowered = packageWorkDir('rules-child-lowered')
    writeFiles(lowered, {
      'parent.ts': "export default { rules: { 'no-var': 'error' } }\n",
      'child.ts':
        "import parent from './parent.ts'\nexport default { extends: [parent], rules: { 'no-var': 'off' } }\n",
      'target.ts': VARIABLE_FILE,
    })
    expect(lint(lowered, 'child.ts', 'target.ts').codes).not.toContain('eslint(no-var)')
  })

  it('Should_ApplyTheLaterEntry_When_TwoExtendedConfigsDisagreeOnARule', () => {
    const dir = packageWorkDir('rules-extends-order')
    writeFiles(dir, {
      'off.ts': "export default { rules: { 'no-var': 'off' } }\n",
      'error.ts': "export default { rules: { 'no-var': 'error' } }\n",
      'forward.ts':
        "import off from './off.ts'\nimport error from './error.ts'\nexport default { extends: [off, error] }\n",
      'reverse.ts':
        "import off from './off.ts'\nimport error from './error.ts'\nexport default { extends: [error, off] }\n",
      'target.ts': VARIABLE_FILE,
    })
    expect(lint(dir, 'forward.ts', 'target.ts').codes).toContain('eslint(no-var)')
    expect(lint(dir, 'reverse.ts', 'target.ts').codes).not.toContain('eslint(no-var)')
  })
})

describe('table row: jsPlugins concatenate', () => {
  it('Should_LoadBothPlugins_When_TheExtendingConfigAddsOne', () => {
    const dir = packageWorkDir('jsplugins-concat')
    const pluginA = path.join(dir, 'plugin-a.mjs')
    const pluginB = path.join(dir, 'plugin-b.mjs')
    writeFiles(dir, {
      'plugin-a.mjs': pluginModule('probe-a'),
      'plugin-b.mjs': pluginModule('probe-b'),
      'parent.ts': `export default { jsPlugins: [${JSON.stringify(pluginA)}], rules: { 'probe-a/hit': 'error' } }\n`,
      'child.ts': `import parent from './parent.ts'\nexport default { extends: [parent], jsPlugins: [${
        JSON.stringify(pluginB)
      }], rules: { 'probe-b/hit': 'error' } }\n`,
      'target.ts': CONSTANT_FILE,
    })
    const codes = lint(dir, 'child.ts', 'target.ts').codes
    expect(codes).toContain('probe-a(hit)')
    expect(codes).toContain('probe-b(hit)')
    expect(printConfig(dir, 'child.ts').jsPlugins).toStrictEqual([pluginB])
  })
})

describe('table row: overrides concatenate', () => {
  it('Should_ApplyBothOverrideSets_When_TheParentAndChildEachDeclareOne', () => {
    const dir = packageWorkDir('overrides-concat')
    writeFiles(dir, {
      'parent.ts': "export default { overrides: [{ files: ['**/parent-only.ts'], rules: { 'no-var': 'error' } }] }\n",
      'child.ts':
        "import parent from './parent.ts'\nexport default { extends: [parent], overrides: [{ files: ['**/child-only.ts'], rules: { 'no-var': 'error' } }] }\n",
      'parent-only.ts': VARIABLE_FILE,
      'child-only.ts': VARIABLE_FILE,
    })
    const result = lint(dir, 'child.ts', 'parent-only.ts', 'child-only.ts')
    expect(result.files).toContain('parent-only.ts')
    expect(result.files).toContain('child-only.ts')
  })
})

describe('table row: ignorePatterns replace', () => {
  it('Should_LintTheParentIgnoredPath_When_TheChildDeclaresItsOwnIgnorePatterns', () => {
    const dir = packageWorkDir('ignore-patterns-replace')
    writeFiles(dir, {
      'parent.ts': "export default { rules: { 'no-var': 'error' }, ignorePatterns: ['**/parent-skip.ts'] }\n",
      'child.ts':
        "import parent from './parent.ts'\nexport default { extends: [parent], ignorePatterns: ['**/child-skip.ts'] }\n",
      'parent-skip.ts': VARIABLE_FILE,
      'child-skip.ts': VARIABLE_FILE,
    })
    expect(printConfig(dir, 'child.ts').ignorePatterns).toStrictEqual(['**/child-skip.ts'])
    const result = lint(dir, 'child.ts', '.')
    expect(result.files).toContain('parent-skip.ts')
    expect(result.files).not.toContain('child-skip.ts')
  })
})

describe('table row: plugins', () => {
  it('Should_ReplaceTheDefaultPluginSet_When_AConfigDeclaresPlugins', () => {
    const dir = packageWorkDir('plugins-replace-defaults')
    writeFiles(dir, { 'lone.ts': "export default { plugins: ['node'] }\n" })
    expect(printConfig(dir, 'lone.ts').plugins).toStrictEqual(['node'])
  })

  it('Should_ConcatenatePluginLists_When_TheConfigExtendsAConfigThatDeclaresPlugins', () => {
    const dir = packageWorkDir('plugins-concat-extends')
    writeFiles(dir, {
      'parent.ts': "export default { plugins: ['typescript'] }\n",
      'child.ts': "import parent from './parent.ts'\nexport default { extends: [parent], plugins: ['node'] }\n",
    })
    expect(printConfig(dir, 'child.ts').plugins).toStrictEqual(['typescript', 'node'])
  })

  it('Should_UnionTheParentPluginsWithTheDefaultSet_When_TheChildDeclaresNone', () => {
    const dir = packageWorkDir('plugins-child-declares-none')
    writeFiles(dir, {
      'parent.ts': "export default { plugins: ['node'] }\n",
      'child.ts': "import parent from './parent.ts'\nexport default { extends: [parent] }\n",
    })
    expect(printConfig(dir, 'child.ts').plugins?.sort()).toStrictEqual(['node', 'oxc', 'typescript', 'unicorn'])
  })
})

describe('table row: a jsPlugin alias wins over the module meta name', () => {
  it('Should_NameTheRuleAfterTheAlias_When_ThePluginAlsoDeclaresAMetaName', () => {
    const dir = packageWorkDir('jsplugin-alias')
    const modulePath = path.join(dir, 'plugin-real.mjs')
    writeFiles(dir, {
      'plugin-real.mjs': pluginModule('probe-real', 'probe-real-unnamed'),
      'aliased.ts': `export default { jsPlugins: [{ name: 'probe-alias', specifier: ${
        JSON.stringify(modulePath)
      } }], rules: { 'probe-alias/hit': 'error' } }\n`,
      'target.ts': CONSTANT_FILE,
    })
    expect(lint(dir, 'aliased.ts', 'target.ts').codes).toContain('probe-alias(hit)')
  })
})

describe('table row: a relative jsPlugin specifier in an extended config is rejected', () => {
  it('Should_RejectTheExtendedConfig_When_TheRootConfigWouldAcceptTheSameSpecifier', () => {
    const dir = packageWorkDir('jsplugins-relative')
    writeFiles(dir, {
      'plugin-a.mjs': pluginModule('probe-a'),
      'root.ts': "export default { jsPlugins: ['./plugin-a.mjs'], rules: { 'probe-a/hit': 'error' } }\n",
      'parent.ts': "export default { jsPlugins: ['./plugin-a.mjs'], rules: { 'probe-a/hit': 'error' } }\n",
      'child.ts': "import parent from './parent.ts'\nexport default { extends: [parent] }\n",
      'target.ts': CONSTANT_FILE,
    })
    expect(lint(dir, 'root.ts', 'target.ts').codes).toContain('probe-a(hit)')

    const extended = run(LOCAL_OXLINT, ['-c', 'child.ts', 'target.ts'], dir)
    expect(extended.code).not.toBe(0)
    expect(extended.output).toContain(
      'Relative JS plugin specifiers are not supported in configs provided via `extends`',
    )
    expect(extended.output).toContain('Found: "./plugin-a.mjs"')
  })
})

describe('table row: a rule whose plugin is not loaded is a config error', () => {
  it('Should_RejectTheConfig_When_ACustomRuleKeyNamesAnUnloadedPlugin', () => {
    const dir = packageWorkDir('unloaded-plugin')
    writeFiles(dir, {
      'cfg.ts':
        "export default { rules: { '@systemfsoftware/oxlint-plugin-cell-vocabulary/no-io-in-phase-bodies': 'error' } }\n",
      'target.ts': CONSTANT_FILE,
    })
    const result = run(LOCAL_OXLINT, ['-c', 'cfg.ts', 'target.ts'], dir)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("Plugin '@systemfsoftware/cell-vocabulary' not found")
  })
})

describe('table row: self-reference import.meta.resolve works', () => {
  it('Should_ResolveInsideThePackage_When_TheSpecifierIsItsOwnName', () => {
    const resolved = import.meta.resolve('@systemfsoftware/oxlint-preset')
    expect(resolved.startsWith('file://')).toBe(true)
    expect(path.dirname(fileURLToPath(resolved)).startsWith(PACKAGE_ROOT)).toBe(true)
  })

  it('Should_LoadTheResolvedSpecifier_When_ItIsHandedToOxlintAsAJsPlugin', () => {
    const specifier = '@systemfsoftware/oxlint-plugin-cell-vocabulary'
    const resolved = run(
      process.execPath,
      ['--input-type=module', '--eval', `process.stdout.write(import.meta.resolve(${JSON.stringify(specifier)}))`],
      PACKAGE_ROOT,
    )
    expect(resolved.code).toBe(0)

    const dir = packageWorkDir('self-reference')
    writeFiles(dir, {
      'cfg.ts': `export default { jsPlugins: [${JSON.stringify(resolved.output.trim())}] }\n`,
      'target.ts': CONSTANT_FILE,
    })
    const result = run(LOCAL_OXLINT, ['-c', 'cfg.ts', 'target.ts'], dir)
    expect(result.output).not.toContain('Failed to')
    expect(result.code).toBe(0)
  })
})

describe('table row: a string extends inherits nothing', () => {
  it('Should_RejectTheConfig_When_ExtendsNamesAPackage', () => {
    const dir = packageWorkDir('string-extends-package')
    writeFiles(dir, { 'cfg.ts': "export default { extends: ['@systemfsoftware/oxlint-plugin-recommended'] }\n" })
    const result = run(LOCAL_OXLINT, ['--print-config', '-c', 'cfg.ts'], dir)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('must be a config object (strings/paths are not supported)')
  })

  it('Should_RejectTheConfig_When_ExtendsNamesAPath', () => {
    const dir = packageWorkDir('string-extends-path')
    writeFiles(dir, {
      'parent.ts': "export default { rules: { 'no-var': 'error' } }\n",
      'cfg.ts': "export default { extends: ['./parent.ts'] }\n",
    })
    const result = run(LOCAL_OXLINT, ['--print-config', '-c', 'cfg.ts'], dir)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('must be a config object (strings/paths are not supported)')
  })
})

describe('table row: every extends in packages/**/oxlint.config.ts is object-form', () => {
  it('Should_DeclareNoStringLiteral_When_AnyPackageConfigExtendsAnother', () => {
    const configs = collectOxlintConfigs(path.join(REPO_ROOT, 'packages'))
    const found: { config: string; form: string }[] = []
    for (const config of configs) {
      const text = readFileSync(config, 'utf8')
      for (const match of text.matchAll(/extends\s*:\s*(\[[^\]]*\]|[^\s,;{}]+)/gu)) {
        found.push({ config, form: match[1] ?? '' })
      }
    }
    expect(configs.length).toBeGreaterThan(0)
    expect(found.length).toBeGreaterThan(0)
    const stringLiteralForms = found
      .filter(({ form }) => /['"`]/u.test(form))
      .map(({ config, form }) => `${path.relative(REPO_ROOT, config)}: ${form}`)
    expect(stringLiteralForms).toStrictEqual([])
  })
})

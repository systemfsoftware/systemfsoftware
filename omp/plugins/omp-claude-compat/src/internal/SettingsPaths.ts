/** Enterprise policy. Hooks from here survive a `disableAllHooks` set anywhere else. */
/** @internal */
export const MANAGED_SETTINGS_PATH = '/etc/claude-code/managed-settings.json'

/** @internal */
export const settingsPaths = (homeDir: string, cwd: string): readonly string[] => [
  `${homeDir}/.claude/settings.json`,
  `${cwd}/.claude/settings.json`,
  `${cwd}/.claude/settings.local.json`,
  MANAGED_SETTINGS_PATH,
]

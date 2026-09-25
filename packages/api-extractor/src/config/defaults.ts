import defaults from './api-extractor-defaults.json' with { type: 'json' }

/**
 * The upstream defaults the read phase's merge starts from, vendored verbatim. Upstream has no
 * default for `mainEntryPointFilePath`, and `enabled` is required in `apiReport`, `docModel`,
 * and `dtsRollup`, so the merge only supplies the paths and message levels those sections leave
 * unsaid.
 */
export const DEFAULT_CONFIG_RECORD = defaults

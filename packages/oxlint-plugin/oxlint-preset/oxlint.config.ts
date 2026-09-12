import base from '../oxlint.config.ts'

export default {
  ...base,
  ignorePatterns: [...base.ignorePatterns, '**/.host-probe-*/**'],
}

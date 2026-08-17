import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  rules: {
    // ── v4 migration: Context.Service replaces Context.Tag (class syntax
    // `extends Context.Service<Self, Shape>()(id)`); the shared ban-classes
    // rule only knows the v3 Context.Tag/Context.Reference variants. Same
    // precedent as packages/effect-daemon-spec/oxlint.config.ts.
    '@systemfsoftware/oxlint-plugin/ban-classes': [
      'error',
      {
        whitelist: [
          'RightsizeConfig',
          'SandboxRuntime',
          'VirtualNetworks',
          'CheckpointStore',
          'ImageRegistry',
          'Selection',
          'RuntimeDiscovery',
          'DockerClientContext',
          'GenericContainer',
        ],
      },
    ],

    // ── Suffix taxonomy dismantled (2026-08-16, user-settled): three
    // suffixed shapes remain — `*.workflow.ts`, `*.workflow.property.test.ts`,
    // `__tests__/**/*.integration.test.ts`; everything else is named by
    // domain, the clanka/effect-torch shape (repos/clanka/src/Agent.ts,
    // repos/effect-torch/packages/core/src/Tensor.ts). The two options below
    // are the plugins' own knobs for a taxonomy-free consumer: plain-stem
    // colocated tests are admitted, property content may live in them, and
    // any relative import of the package's own source satisfies the
    // behaviour rule's shell-entry requirement. The cell library's brand
    // checks (Workflow.make, Wire, Cell descriptions) carry the structure
    // the filenames used to; the content rules (pbt-naming,
    // no-nested-quantification, purity-in-property-files) stay on.
    '@systemfsoftware/effect-dmmf/no-test-file-in-src': [
      'error',
      { admitPlainStems: true },
    ],
    '@systemfsoftware/effect-dmmf/behaviour-exercises-use-case': [
      'error',
      { admitSrcImports: true },
    ],
    '@systemfsoftware/effect-dmmf/property-file-purity': [
      'error',
      { admitPlainStems: true },
    ],
  },
})

## 1.4.0

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Fail a compile on errors only, not on the tree's standing suggestions

  The dry run and the per-mutant check counted every diagnostic the program produced, so the Effect language service's suggestions — which the pristine tree carries by design and which surface in `lint:tsgo` and the editor — refused mutation runs outright with a dry-run compile error. Only error-category diagnostics fail a compile now; warnings and suggestions were never compile failures

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text

- These packages no longer ship their development files. Sources, tests and build, lint and
  test configuration were all included, which broke consumers in one specific way: oxlint
  discovers configuration by walking directories, finds the published `oxlint.config.ts` under
  `node_modules`, and stops with "Stripping types is currently unsupported for files under
  node_modules" before linting anything.

  The installed package now contains the compiled output, the runtime schema files it reads,
  and the usual manifest, README and licence

- Updated dependencies:
  - @systemfsoftware/stryker-js-plugin-api@2.0.0

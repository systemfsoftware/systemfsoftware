## 0.1.1

### Patch Changes

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
  - @systemfsoftware/stryker-js-plugin-api@1.0.0

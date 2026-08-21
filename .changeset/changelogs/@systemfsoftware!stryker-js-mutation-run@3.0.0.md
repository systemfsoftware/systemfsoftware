## 3.0.0

### Major Changes

- Timeout options now take the values they document. `timeoutFactor`, `timeoutMS` and
  `dryRunTimeoutMinutes` arrived unset whenever a configuration left them out, so the
  initial test run was given a budget of one millisecond and every run ended with "Initial
  test run timed out" before testing anything. A run that leaves them out now gets the
  documented 1.5, 5000 and 5

  Configuration is validated against the same declaration that supplies the defaults, so a
  default can no longer go missing while the option that documents it stays listed. Invalid
  configurations still report every offending option in one pass, and options contributed
  by plugins are still accepted

  `dashboard` and `eventReporter` are no longer accepted. The reporters they configured
  were already removed, and the two names were already rejected on sight, so a
  configuration setting either has been failing; they are now absent from the option set
  as well. Remove them from your configuration — to publish a report, write the `json` or
  `html` report and publish it yourself

  One fewer package is installed alongside these

### Minor Changes

- The base mutation preset selects at the make boundary.

  The preset carries both ignorers (`effect-schema-declarations`, `workflow-make-boundary`) and
  `disableBail: true`, so killer recording is structural for every inheriting config. The sandwich
  packages (daemon-spec, stryker-js-cli, omp-claude-compat) widen `mutate` to all non-test source
  at explicit 100/100/100 thresholds — the ignorer is the selector, so membership is forced by the
  brand rather than chosen by a path list. Library packages' mutate arrays are byte-identical.

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Config inheritance no longer depends on which module resolver serves the process.

  A config that extends a package specifier is resolved relative to the directory of the config file that declared it, and the same chain now produces the same merged options whichever resolver is in play. Previously the outcome could differ between environments for the same files.

  Error reporting is unchanged: an inheritance cycle, an `extends` that is not a string, and a parent that cannot be resolved or read each surface the same configuration error as before, naming the same file.

- Mutation runs no longer fail during the initial test run when a call argument
  carries an optional member set to `undefined`, a class instance, or a date. The
  worker protocol now carries the value a caller passes and sends across the wire
  whatever the wire can represent, rather than refusing the call. A method that
  returns nothing still reports no value, and a reply a process cannot read is still
  reported as a failure of that child rather than raised as an unhandled error.

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

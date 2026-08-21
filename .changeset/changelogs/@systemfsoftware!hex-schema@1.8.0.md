## 1.8.0

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- The `0x`-prefix codec directions move to a new internal `prefixed-hex.kernel.ts` as `stripHexPrefix` and `addHexPrefix`. `prefixed-hex.schema.ts` and `uint8array-from-prefixed-hex.schema.ts` encode and decode exactly as before.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text

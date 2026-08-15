# Tarballs

Built `.tgz` packages for local installation checks.

Generate them from the repository root:

```bash
pnpm run package:tgz
```

The tarballs are consumed by `experimental/install` and `experimental/test-unplugin` smoke checks.

Two flags change what is packed:

- `--current` (or `TTSC_TARBALLS_CURRENT=1`) packs only the current platform and the packages the PR smoke checks consume, which is what `typia.yml` and `nestia.yml` run.
- `--print-plan` prints both plans as JSON and packs nothing. `scripts/ci/factory-package.test.cjs` reads it to fail when a published package is neither packed nor excluded with a written reason.

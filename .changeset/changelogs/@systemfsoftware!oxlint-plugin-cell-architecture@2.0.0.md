## 2.0.0

### Major Changes

- `no-io-boundary-tests` is removed rather than renamed. It selected on the filename (`/\.(?:acl|store|adapter|handler)\.[cm]?tsx?$/`), so it could not fire on its own subject — an author writing a module that calls the filesystem does not name it `.acl.ts` — and two of the four suffixes it advertised matched no file in this tree. The verdict it was aimed at is already owned, decided from the module's own called non-type imports, by `oxlint-plugin-test-discipline`'s `no-io-module-in-source-test`; a second rule deriving the same verdict from the same imports would report every violation twice. Consumer configs naming `no-io-boundary-tests` must drop the entry.

  The remaining `none` entries record touches that release nothing: no exported name changes.

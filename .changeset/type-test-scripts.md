---
"@systemfsoftware/effect-gherkin-spec": patch
"@systemfsoftware/stryker-plugins": patch
---

Fix two `test:types` scripts that could not pass.

`tstyche` exits 1 with "No test files were selected using current configuration" when nothing matches
`testFileMatch`, so a watcher pointed at files that do not exist is a script guaranteed to fail the
moment anyone runs it. Measured directly: `effect-gherkin-spec`'s `tstyche.json` matched
`src/**/*.tst.ts` and the package holds no such file, so its `test:types` script is removed rather than
left as a gate attached to nothing. `stryker-plugins` now pins `TSTYCHE_TYPESCRIPT_MODULE` so its own
`test:types` resolves the TypeScript module it needs.

Both packages publish, and both scripts ship in the published `package.json`, so a consumer inspecting
or running them sees the change — a real patch rather than an empty intent.

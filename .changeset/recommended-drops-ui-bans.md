---
"@systemfsoftware/oxlint-config-recommended": major
---

The preset no longer reports imports of React server-state libraries (`@tanstack/react-query`, `swr`, `urql` and the rest), `fetch` in `.tsx` files, or `page.screenshot` in Storybook story files. It no longer exports `serverStateImports`, `nodeBuiltinAndServerStateImports`, `fetchInComponentsGlobals`, `fetchInComponentsProperties`, `storyScreenshotProperties`, `fetchAndStoryScreenshotProperties`, or the types `ImportPattern`, `PatternImportBan`, `RestrictedGlobal`, `RestrictedGlobalsBan`, `RestrictedProperty` and `RestrictedPropertiesBan`.

These rules now ship from systemfsoftware/frontend. A config that imports any of these exports must drop the import; take the rules from systemfsoftware/frontend to keep them.

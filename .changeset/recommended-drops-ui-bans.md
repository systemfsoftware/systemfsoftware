---
"@systemfsoftware/oxlint-config-recommended": major
---

Removes three bans that were added on main after 4.0.0 and were never in a tagged release: imports of React server-state libraries (`@tanstack/react-query`, `swr`, `urql` and the rest), `fetch` in `.tsx` files, and `page.screenshot` in Storybook story files. If you consume this preset from a main commit that had them, these rules stop reporting, and these exports are gone: `serverStateImports`, `nodeBuiltinAndServerStateImports`, `fetchInComponentsGlobals`, `fetchInComponentsProperties`, `storyScreenshotProperties`, `fetchAndStoryScreenshotProperties`, and the types `ImportPattern`, `PatternImportBan`, `RestrictedGlobal`, `RestrictedGlobalsBan`, `RestrictedProperty` and `RestrictedPropertiesBan`.

The rules now ship from systemfsoftware/frontend. Drop any import of these exports, and take the rules from systemfsoftware/frontend to keep them.

---
title: The navigation, hero, pricing, every form and the footer of a page pin the roles and names a screen-reader user meets in a hand-written ARIA snapshot
applies_when:
  - adding or changing a page's header navigation, hero, pricing, form or footer
  - renaming a button, link, heading or field on a public page
  - a page's ARIA snapshot test fails, or a change updates a snapshot
tags: [accessibility, aria-snapshot, accessibility-tree, playwright, review, page-suite]
---

Each key region is a landmark or a named section (`<section aria-labelledby>`), found by role and name (ui-testing pack: queries-are-accessible.md). The page suite's `aria-snapshot` test asserts each at both widths with `expect(region).toMatchAriaSnapshot(...)`.

- Write the snapshot as the requirement: the headings and their levels, links, buttons, fields, names and states a person must meet, using partial matching (leave out what is not promised; use a `/regex/` for seeded values). The testing pack's expected-values-come-from-the-requirement.md applies.
- Never commit a generated dump of a whole page, and never accept `--update-snapshots` output unread: a changed snapshot is a reviewed change to what a person hears.

```typescript
// WRONG: a generated whole-page dump nobody reads
await expect(page.locator('body')).toMatchAriaSnapshot()
// RIGHT
await expect(page.getByRole('region', { name: 'Pricing' })).toMatchAriaSnapshot(`
  - heading "Pricing" [level=2]
  - heading "Pro" [level=3]
  - link "Start a Pro trial"
`)
```

Gate: the page suite's `aria-snapshot` test fails on a changed role, name, level or state; review — the reviewer reads every snapshot diff as a change to what a person hears.

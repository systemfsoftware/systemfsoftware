---
"@systemfsoftware/stryker-js": major
---

Removed the unused `output-file` and `provided-options` entry points — neither carried vocabulary the rest of the package does not already provide.

If you imported `output-file`, write the directory and file through your own filesystem service. If you imported the `ProvidedStrykerOptions` alias, use `StrykerOptions` from `@systemfsoftware/stryker-js/Schema` instead.

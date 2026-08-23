---
"@systemfsoftware/stryker-test-contribution": minor
---

A plugin that fails a mutation run when a required test file kills no mutant that another test file does not also kill. Install the package, list it in `plugins`, and set `requireTestContribution` to the suffixes you want judged. Listing the plugin turns the check on. Set that option to `null` to turn the check off.

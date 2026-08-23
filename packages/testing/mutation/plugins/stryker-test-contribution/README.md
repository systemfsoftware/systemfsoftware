# @systemfsoftware/stryker-test-contribution

Fails a mutation run when a required test file kills no mutant that another test file does not also kill.

Listing the plugin turns the check on. There is no reporter to add.

## Install

```bash
pnpm add -D @systemfsoftware/stryker-test-contribution
```

## Configure

```json
{
  "plugins": ["@systemfsoftware/stryker-test-contribution"],
  "requireTestContribution": [
    ".workflow.property.test.ts",
    ".policy.property.test.ts",
    ".kernel.property.test.ts"
  ]
}
```

Set `requireTestContribution` to `null` to turn the check off while leaving the plugin installed.

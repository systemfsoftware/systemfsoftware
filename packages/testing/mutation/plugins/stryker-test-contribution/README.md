# @systemfsoftware/stryker-test-contribution

Fails a mutation run when a required test file kills no mutant that another test file does not also kill.

Listing the plugin in `plugins` turns the check on. There is no option to set and no reporter to add.

## Install

```bash
pnpm add -D @systemfsoftware/stryker-test-contribution
```

## Configure

```json
{
  "plugins": ["@systemfsoftware/stryker-test-contribution"]
}
```

The gate polices `.workflow.property.test.ts`, `.policy.property.test.ts`, and `.kernel.property.test.ts` files. To turn the check off, remove the plugin from `plugins`.

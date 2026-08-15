# Evidence Overall Final

Confirm every claim remains enabled. Do not edit `lint.config.ts` or lower `evidence/graph` or `evidence/review` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic and stop it after a rebuild completes without diagnostics.

Use the frontend `pnpm dev` process kept running by Frontend Start. Fix every diagnostic, wait for a reload without diagnostics, and keep it running.

Frontend Review is the last review and it left both suites passing, so a Final correction here is usually a tag, not a behavior. Rewrite that tag's review with it: `evidence/review` reports a review that is missing, never one that stopped being true. Rerunning backend `pnpm test` or frontend `pnpm test:e2e` is your call, since both compiler processes report type and lint diagnostics only, so run them when a correction actually touched behavior and fix every failure.

## Final Checklist

- [ ] Every claim remained enabled, with `evidence/graph`, `evidence/review`, and `evidence/todo` still at `error`.
- [ ] Nothing else in the three configurations changed since the last Review.
- [ ] Every acknowledgement corrected here had its review rewritten from the check that justified the correction.
- [ ] After the last file change, backend `check:watch` completed a rebuild without diagnostics.
- [ ] After the last file change, frontend `pnpm dev` completed a reload without diagnostics and remains running.
- [ ] Backend `check:watch` stopped after that rebuild.

Any unchecked item leaves the Goal active. Complete that item.

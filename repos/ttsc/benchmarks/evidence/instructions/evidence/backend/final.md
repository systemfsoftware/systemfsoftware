# Evidence Backend Final

Confirm every backend claim remains enabled. Do not edit `lint.config.ts` or lower `evidence/graph` or `evidence/review` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic and wait for a rebuild without diagnostics. Keep it running.

Backend Review left `pnpm test` passing, and a Final correction is usually a tag, not a behavior. Rewrite that tag's review with it: `evidence/review` reports a review that is missing, never one that stopped being true. Rerunning the suite is your call, since the watcher reports type and lint diagnostics only, so run it when a correction actually touched behavior and fix every failure.

## Final Checklist

- [ ] Every backend claim remained enabled, with `evidence/graph`, `evidence/review`, and `evidence/todo` still at `error`.
- [ ] Nothing else in either configuration changed since the last Review.
- [ ] Every acknowledgement corrected here had its review rewritten from the check that justified the correction.
- [ ] After the last backend file change, `check:watch` completed a rebuild without diagnostics.
- [ ] Backend `check:watch` remains running.

Any unchecked item leaves the Goal active. Complete that item.

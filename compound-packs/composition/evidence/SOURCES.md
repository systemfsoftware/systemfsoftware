# Sources

Every upstream path a composition rule cites is relative to the root of one of these repositories, at the commit shown. The b3d082e3 research read shallow clones of these commits; `FINDINGS.md` and `PACK.md` in this folder are its record.

| Short name in citations | Repository                                     | Commit                                     | Commit date |
| ----------------------- | ---------------------------------------------- | ------------------------------------------ | ----------- |
| `effect-smol/`          | https://github.com/Effect-TS/effect-smol       | `3a1128c7684e04d34d9f541f77adaac38a513056` | 2026-07-14  |
| `query/`                | https://github.com/TanStack/query              | `914eef777b0ab9573e979b69c49e9825f74f95d2` | 2026-10-22  |
| `router/`               | https://github.com/TanStack/router             | `08a419c109ea2739fef0b893e09f4919fbd1b0d8` | 2026-10-21  |
| `vitest/`               | https://github.com/vitest-dev/vitest           | `c8558f1c2e3232a119aed69ca53e6923b232094c` | 2026-10-21  |
| `std/`                  | https://github.com/denoland/std                | `f834d0223364361169314833e3c7a8f62ce11d58` | 2026-09-25  |
| `rat-stack/`            | https://github.com/joelhooks/rat-stack         | `87dea7125b103f0962ca7922cccf71e81e044bec` | 2026-10-21  |
| Stead                   | https://github.com/nythrox/Stead               | `92fa6e607cdb5939766edd8be56b043ccec7c1a8` | 2026-10-09  |
| younna-ai               | github.com/systemfsoftware/younna-ai (private) | `a80c7cb3b6dc5832d8cfb0547bd26c485504a316` | 2026-10-23  |

A pinned file is read as `https://github.com/<repo>/blob/<commit>/<path>`.

Two sources are not repositories:

- **The ratstack.sh corpus** (the Rat Stack website, read 2026-10-21). The cartridge test (labeled, push in, pull out, self-contained, easy to throw away) is on `https://ratstack.sh/lore/cartridges` and `https://ratstack.sh/lore/a-clean-playground`; the admission that one-line infrastructure removal is unproven for `packages/subscriber-delivery` is in the same corpus, not in the repository. The per-feature removal checklist ("Keep or cut") is in the repository's top-level readme, lines 171-181 at the commit above.
- **The younna-ai census** (FINDINGS.md, Cycle 006) was measured on a 2026-10-21 working tree. Figures from it are a snapshot: at `a80c7cb3b6` (2026-10-23) `workers/platform` exports 24 keys, not 136; the library-to-Worker imports in `packages/agent/src/conversation/agent-db-rows.ts:1` and `packages/app-runtime/src/personal-apps/bundle-commit.ts:12,19` are still present.
